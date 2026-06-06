#ifndef SHADOWMESH_REGISTRY_HPP
#define SHADOWMESH_REGISTRY_HPP

// Load the known-shadow-vessel registry. The file holds {"imos": [...],
// "vessels": {"9329760": {"name": "...", "program": "...", "flag": "..."}}}.
// A detection whose imo is a key here is flagged CONFIRMED at sign time, and the
// node stamps the vessel's name/program onto the record for the detail card.

#include <fstream>
#include <map>
#include <stdexcept>
#include <string>

#include "json.hpp"

namespace mesh {

using Registry = std::map<std::string, nlohmann::json>;  // imo -> {name,program,flag}

inline Registry load_known_shadow(const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    throw std::runtime_error("cannot open known-shadow registry: " + path);
  }
  nlohmann::json doc;
  in >> doc;

  Registry reg;
  if (doc.contains("vessels") && doc["vessels"].is_object()) {
    for (const auto& [imo, info] : doc["vessels"].items()) {
      reg[imo] = info;
    }
  } else if (doc.contains("imos") && doc["imos"].is_array()) {
    for (const auto& imo : doc["imos"]) {
      reg[imo.get<std::string>()] = nlohmann::json::object();
    }
  } else {
    throw std::runtime_error("registry needs \"vessels\" or \"imos\": " + path);
  }
  return reg;
}

}  // namespace mesh

#endif  // SHADOWMESH_REGISTRY_HPP
