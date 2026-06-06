#ifndef SHADOWMESH_ARGS_HPP
#define SHADOWMESH_ARGS_HPP

// Command-line flags for a node:
//   node --id node1 --http-port 8081 --key keys/node1.key --allowlist keys/trusted-keys.json
//   node --gen-key keys/node1.key          (write/ensure keyfile, print pubkey, exit)

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>

namespace mesh {

struct Args {
  std::string id = "node1";
  int http_port = 8081;
  std::string seed = "../data/seed-detections.json";
  std::string key = "keys/node1.key";
  std::string allowlist = "keys/trusted-keys.json";
  std::string known_shadow = "../data/known-shadow-vessels.json";
  std::string gen_key;     // non-empty => keygen mode
  int gossip_port = 0;     // 0 => gossip disabled (single-node mode)
  std::string peers;       // "host:port,host:port"
  int gossip_interval = 1000;
  int ais = 0;             // >0 => fetch N live sanctioned vessels from Digitraffic
};

// Walk argv for `--key value` flags. Unknown flags are a hard error so a typo
// never silently runs with a default.
inline Args parse_args(int argc, char** argv) {
  Args a;
  for (int i = 1; i < argc; ++i) {
    const std::string flag = argv[i];
    if (flag == "--help") {
      std::cout << "usage: node [--id ID] [--http-port N] [--seed PATH] "
                   "[--key PATH] [--allowlist PATH]\n"
                   "            [--gossip-port N] [--peers host:port,...] "
                   "[--gossip-interval MS]\n"
                   "       node --gen-key PATH\n";
      std::exit(0);
    }
    if (i + 1 >= argc) {
      throw std::runtime_error("flag " + flag + " needs a value");
    }
    const std::string value = argv[++i];
    if (flag == "--id") {
      a.id = value;
    } else if (flag == "--http-port") {
      a.http_port = std::stoi(value);
    } else if (flag == "--seed") {
      a.seed = value;
    } else if (flag == "--key") {
      a.key = value;
    } else if (flag == "--allowlist") {
      a.allowlist = value;
    } else if (flag == "--known-shadow") {
      a.known_shadow = value;
    } else if (flag == "--gen-key") {
      a.gen_key = value;
    } else if (flag == "--gossip-port") {
      a.gossip_port = std::stoi(value);
    } else if (flag == "--peers") {
      a.peers = value;
    } else if (flag == "--gossip-interval") {
      a.gossip_interval = std::stoi(value);
    } else if (flag == "--ais") {
      a.ais = std::stoi(value);
    } else {
      throw std::runtime_error("unknown flag: " + flag);
    }
  }
  return a;
}

}  // namespace mesh

#endif  // SHADOWMESH_ARGS_HPP
