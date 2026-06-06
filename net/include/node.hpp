#ifndef SHADOWMESH_NODE_HPP
#define SHADOWMESH_NODE_HPP

// A mesh node: its identity (id + keypair), a trusted-key allowlist, and an
// in-memory store of detection records keyed by id. Keyed by id because gossip
// is union-by-id — "insert if absent" — and records are immutable so a re-seen
// id is a no-op. The mutex guards the store: gossip threads write while the HTTP
// thread reads.

#include <atomic>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <utility>

#include "crypto.hpp"
#include "json.hpp"

namespace mesh {

class Node {
 public:
  Node(std::string id, KeyPair kp) : id_(std::move(id)), kp_(std::move(kp)) {}

  const std::string& id() const { return id_; }
  std::string pub_b64() const { return to_b64(kp_.pk); }

  size_t size() const {
    std::lock_guard<std::mutex> lock(mu_);
    return store_.size();
  }

  // Count of records rejected for failing the allowlist/signature check — the
  // visible evidence that a rogue node is being kept out.
  size_t rejected() const { return rejected_.load(); }

  // Public keys allowed to author records. A record signed by anything else is
  // rejected by ingest_remote. Must include this node's own key (its records
  // come back via gossip).
  void set_allowlist(std::set<std::string> keys) {
    allowlist_ = std::move(keys);
  }

  // Known shadow-vessel registry (imo -> {name,program,flag}). A record whose
  // imo is here is flagged CONFIRMED.
  void set_known_shadow(std::map<std::string, nlohmann::json> registry) {
    known_shadow_ = std::move(registry);
  }

  // Stamp a locally-sourced record (seed or operator inject) with our identity,
  // resolve its status against the known-shadow registry, sign it, store it.
  void sign_and_store(nlohmann::json record) {
    const std::string imo = record.value("imo", "");
    record["imo"] = imo;
    const auto hit = imo.empty() ? known_shadow_.end() : known_shadow_.find(imo);
    if (hit != known_shadow_.end()) {
      // Known OFAC vessel: the registry is authoritative.
      record["status"] = "CONFIRMED";
      record["vessel_name"] = hit->second.value("name", "");
      record["vessel_program"] = hit->second.value("program", "");
    } else if (record.value("status", "") == "CONFIRMED") {
      // Operator on-site confirmation of an unregistered dark candidate.
      record["status"] = "CONFIRMED";
    } else {
      record["status"] = "SUSPECTED";
    }
    record["origin"] = id_;
    record["origin_pubkey"] = pub_b64();
    record["sig"] = sign(record, kp_.sk);
    const std::string id = record.value("id", "");
    std::lock_guard<std::mutex> lock(mu_);
    store_[id] = std::move(record);
  }

  // Ingest a record received from a peer. Accept only if it carries a signature
  // from an allowlisted key that verifies. Returns true if accepted (incl.
  // already-held), false if rejected. This is what stops a rogue node.
  bool ingest_remote(const nlohmann::json& record) {
    const std::string pub = record.value("origin_pubkey", "");
    const std::string sig = record.value("sig", "");
    if (pub.empty() || sig.empty() || allowlist_.count(pub) == 0) {
      ++rejected_;
      return false;
    }
    if (!verify(record, sig, pub)) {
      ++rejected_;
      return false;
    }
    const std::string id = record.value("id", "");
    std::lock_guard<std::mutex> lock(mu_);
    store_.emplace(id, record);  // no-op if id already present (immutable)
    return true;
  }

  // All stored records as a JSON array (sorted by id, insertion-independent).
  nlohmann::json all() const {
    nlohmann::json out = nlohmann::json::array();
    std::lock_guard<std::mutex> lock(mu_);
    for (const auto& [id, rec] : store_) {
      out.push_back(rec);
    }
    return out;
  }

 private:
  std::string id_;
  KeyPair kp_;
  std::set<std::string> allowlist_;
  std::map<std::string, nlohmann::json> known_shadow_;
  std::map<std::string, nlohmann::json> store_;
  std::atomic<size_t> rejected_{0};
  mutable std::mutex mu_;
};

}  // namespace mesh

#endif  // SHADOWMESH_NODE_HPP
