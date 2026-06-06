#ifndef SHADOWMESH_TRUST_HPP
#define SHADOWMESH_TRUST_HPP

// Load the trusted-key allowlist: a JSON array of base64 Ed25519 public keys.
// Only records authored by a key in this set are accepted from peers.

#include <fstream>
#include <set>
#include <stdexcept>
#include <string>

#include "json.hpp"

namespace mesh {

inline std::set<std::string> load_allowlist(const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    throw std::runtime_error("cannot open allowlist: " + path);
  }
  nlohmann::json keys;
  in >> keys;
  if (!keys.is_array()) {
    throw std::runtime_error("allowlist must be a JSON array: " + path);
  }
  std::set<std::string> out;
  for (const auto& k : keys) {
    out.insert(k.get<std::string>());
  }
  return out;
}

}  // namespace mesh

#endif  // SHADOWMESH_TRUST_HPP
