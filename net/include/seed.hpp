#ifndef SHADOWMESH_SEED_HPP
#define SHADOWMESH_SEED_HPP

// Load a hand-made / adapter-produced seed file (a JSON array of records) into a
// node, signing each on ingest. The adapter for the judge dataset will produce
// the same array shape, so it flows through here unchanged.

#include <fstream>
#include <stdexcept>
#include <string>

#include "json.hpp"
#include "node.hpp"

namespace mesh {

inline void load_seed_into(Node& node, const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    throw std::runtime_error("cannot open seed file: " + path);
  }
  nlohmann::json records;
  in >> records;
  if (!records.is_array()) {
    throw std::runtime_error("seed file must be a JSON array: " + path);
  }
  for (auto& record : records) {
    node.sign_and_store(record);
  }
}

}  // namespace mesh

#endif  // SHADOWMESH_SEED_HPP
