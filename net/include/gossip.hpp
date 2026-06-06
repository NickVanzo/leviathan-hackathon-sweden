#ifndef SHADOWMESH_GOSSIP_HPP
#define SHADOWMESH_GOSSIP_HPP

// Peer-to-peer anti-entropy gossip over raw POSIX TCP. Every ~1s a node dials
// each static peer and they exchange full record sets; both sides ingest_remote
// everything, so the stores converge (union by id) and rogue records are
// rejected at the allowlist. A killed peer just makes connect() fail — the
// dialer skips it and retries next round, which is exactly the resilience demo.
//
// Wire protocol (one round, one TCP connection), half-close framing:
//   dialer:  send(my records) -> shutdown(WR) -> recv(peer records to EOF)
//   listener: recv(dialer records to EOF) -> send(my records) -> close
// Records are immutable JSON, so no length prefix is needed: EOF delimits.

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <chrono>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

#include "json.hpp"
#include "node.hpp"

namespace mesh {

struct Peer {
  std::string host;
  int port;
};

// "127.0.0.1:9082,127.0.0.1:9083" -> [{127.0.0.1,9082},{127.0.0.1,9083}].
inline std::vector<Peer> parse_peers(const std::string& csv) {
  std::vector<Peer> peers;
  size_t start = 0;
  while (start < csv.size()) {
    const size_t comma = csv.find(',', start);
    const std::string token =
        csv.substr(start, comma == std::string::npos ? std::string::npos
                                                     : comma - start);
    const size_t colon = token.rfind(':');
    if (colon != std::string::npos) {
      peers.push_back({token.substr(0, colon), std::stoi(token.substr(colon + 1))});
    }
    if (comma == std::string::npos) break;
    start = comma + 1;
  }
  return peers;
}

inline bool send_all(int fd, const std::string& data) {
  size_t sent = 0;
  while (sent < data.size()) {
    const ssize_t n = send(fd, data.data() + sent, data.size() - sent, 0);
    if (n <= 0) return false;
    sent += static_cast<size_t>(n);
  }
  return true;
}

inline std::string recv_to_eof(int fd) {
  std::string out;
  char buf[4096];
  ssize_t n;
  while ((n = recv(fd, buf, sizeof(buf), 0)) > 0) {
    out.append(buf, static_cast<size_t>(n));
  }
  return out;
}

// Merge a received JSON array into the node, logging new records and rejects.
inline void ingest_payload(Node& node, const std::string& payload,
                           const std::string& src) {
  if (payload.empty()) return;
  nlohmann::json arr;
  try {
    arr = nlohmann::json::parse(payload);
  } catch (const std::exception&) {
    return;
  }
  if (!arr.is_array()) return;

  const size_t before = node.size();
  int rejected = 0;
  for (const auto& record : arr) {
    if (!node.ingest_remote(record)) ++rejected;
  }
  const size_t added = node.size() - before;
  if (added > 0) {
    std::cout << "[gossip] " << node.id() << " <- " << src << ": +" << added
              << " new (total " << node.size() << ")" << std::endl;
  }
  if (rejected > 0) {
    std::cout << "[gossip] " << node.id() << " <- " << src << ": REJECTED "
              << rejected << " untrusted record(s)" << std::endl;
  }
}

inline int dial(const Peer& peer) {
  const int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return -1;
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(peer.port));
  if (inet_pton(AF_INET, peer.host.c_str(), &addr.sin_addr) != 1 ||
      connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
    close(fd);
    return -1;
  }
  return fd;
}

// One outbound anti-entropy round with a peer. Silent if the peer is down.
inline void exchange(Node& node, const Peer& peer) {
  const int fd = dial(peer);
  if (fd < 0) return;
  send_all(fd, node.all().dump());
  shutdown(fd, SHUT_WR);
  const std::string reply = recv_to_eof(fd);
  close(fd);
  ingest_payload(node, reply, peer.host + ":" + std::to_string(peer.port));
}

inline void handle_inbound(Node& node, int fd) {
  const std::string payload = recv_to_eof(fd);
  ingest_payload(node, payload, "inbound");
  send_all(fd, node.all().dump());
  close(fd);
}

// Accept loop — runs on its own thread.
inline void run_listener(Node& node, int port) {
  const int lfd = socket(AF_INET, SOCK_STREAM, 0);
  if (lfd < 0) throw std::runtime_error("gossip socket() failed");
  int yes = 1;
  setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(port));
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(lfd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0 ||
      listen(lfd, 8) < 0) {
    close(lfd);
    throw std::runtime_error("gossip bind/listen failed on port " +
                             std::to_string(port));
  }
  std::cout << "gossip listening on 127.0.0.1:" << port << std::endl;
  while (true) {
    const int cfd = accept(lfd, nullptr, nullptr);
    if (cfd < 0) continue;
    std::thread(handle_inbound, std::ref(node), cfd).detach();
  }
}

// Dial every peer every `interval` ms — runs on its own thread.
inline void run_dialer(Node& node, std::vector<Peer> peers, int interval_ms) {
  while (true) {
    for (const Peer& peer : peers) {
      exchange(node, peer);
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
  }
}

}  // namespace mesh

#endif  // SHADOWMESH_GOSSIP_HPP
