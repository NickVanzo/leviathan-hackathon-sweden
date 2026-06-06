#include <csignal>
#include <iostream>
#include <thread>

#include <sodium.h>

#include "ais.hpp"
#include "args.hpp"
#include "crypto.hpp"
#include "gossip.hpp"
#include "http_api.hpp"
#include "node.hpp"
#include "registry.hpp"
#include "seed.hpp"
#include "trust.hpp"

namespace {

// `node --gen-key PATH`: ensure the keyfile exists, print its pubkey, exit.
// Used by `make keys` to assemble the trusted-key allowlist.
int run_gen_key(const std::string& path) {
  const mesh::KeyPair kp = mesh::load_or_create_key(path);
  std::cout << mesh::to_b64(kp.pk) << "\n";
  return 0;
}

// Start gossip listener + dialer on background threads (detached; the process
// exiting tears them down). No-op if --gossip-port wasn't given.
void start_gossip(mesh::Node& node, const mesh::Args& args) {
  if (args.gossip_port == 0) return;
  std::thread(mesh::run_listener, std::ref(node), args.gossip_port).detach();
  std::thread(mesh::run_dialer, std::ref(node), mesh::parse_peers(args.peers),
              args.gossip_interval)
      .detach();
}

}  // namespace

int main(int argc, char** argv) {
  if (sodium_init() < 0) {
    std::cerr << "libsodium init failed\n";
    return 1;
  }
  // A dead peer must not kill us with SIGPIPE on send().
  std::signal(SIGPIPE, SIG_IGN);

  try {
    const mesh::Args args = mesh::parse_args(argc, argv);

    if (!args.gen_key.empty()) {
      return run_gen_key(args.gen_key);
    }

    mesh::Node node(args.id, mesh::load_or_create_key(args.key));
    node.set_allowlist(mesh::load_allowlist(args.allowlist));
    const auto registry = mesh::load_known_shadow(args.known_shadow);
    node.set_known_shadow(registry);
    mesh::load_seed_into(node, args.seed);

    if (args.ais > 0) {
      try {
        std::cout << "fetching live Baltic AIS (Digitraffic)..." << std::endl;
        const auto live = mesh::fetch_sanctioned_live(registry, args.ais);
        for (auto& rec : live) node.sign_and_store(rec);
        std::cout << "ingested " << live.size() << " live sanctioned vessels"
                  << std::endl;
      } catch (const std::exception& e) {
        std::cerr << "warning: AIS fetch failed (" << e.what()
                  << "), continuing with seed only\n";
      }
    }

    std::cout << "node " << node.id() << " | pubkey " << node.pub_b64() << "\n"
              << "store holds " << node.size() << " records" << std::endl;

    start_gossip(node, args);
    mesh::serve_http(node, args.http_port);
  } catch (const std::exception& e) {
    std::cerr << "error: " << e.what() << '\n';
    return 1;
  }

  return 0;
}
