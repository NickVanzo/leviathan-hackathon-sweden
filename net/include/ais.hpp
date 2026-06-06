#ifndef SHADOWMESH_AIS_HPP
#define SHADOWMESH_AIS_HPP

// Live AIS ingest from Finnish Digitraffic (open, no key, Baltic coverage). We
// shell out to curl for the HTTPS fetch so the node links no TLS stack, then
// join the two feeds in C++:
//   /locations -> mmsi -> {lat, lon, timestamp}
//   /vessels   -> mmsi -> {imo, name (as broadcast), dimensions}
// We keep vessels whose IMO is in the known-shadow registry (-> CONFIRMED) and
// record the broadcast name too, since shadow vessels often broadcast a name
// that differs from their sanctioned identity (identity laundering).
//
// The parsed selection is cached in memory; a refetch within the TTL is a no-op.

#include <cstdio>
#include <ctime>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

#include "json.hpp"

namespace mesh {

inline std::string http_get(const std::string& url) {
  const std::string cmd =
      "curl -fsSL --compressed -H 'Accept: application/json' "
      "-H 'Digitraffic-User: sweden-hackathon-shadowmesh' '" +
      url + "'";
  FILE* pipe = popen(cmd.c_str(), "r");
  if (!pipe) throw std::runtime_error("popen(curl) failed");
  std::string out;
  char buf[8192];
  size_t n;
  while ((n = fread(buf, 1, sizeof(buf), pipe)) > 0) out.append(buf, n);
  if (pclose(pipe) != 0) throw std::runtime_error("curl failed for " + url);
  return out;
}

inline std::string iso8601(long ms) {
  const std::time_t secs = ms / 1000;
  std::tm tm{};
  gmtime_r(&secs, &tm);
  char out[32];
  std::strftime(out, sizeof(out), "%Y-%m-%dT%H:%M:%SZ", &tm);
  return out;
}

// Fetch live Baltic AIS and return up to `limit` detection records for vessels
// whose IMO is in `registry`. Records carry the broadcast name in `ais_name`.
inline std::vector<nlohmann::json> fetch_sanctioned_live(
    const std::map<std::string, nlohmann::json>& registry, size_t limit) {
  const std::string base = "https://meri.digitraffic.fi/api/ais/v1/";
  const nlohmann::json loc = nlohmann::json::parse(http_get(base + "locations"));
  const nlohmann::json ves = nlohmann::json::parse(http_get(base + "vessels"));

  std::map<long, const nlohmann::json*> pos;
  for (const auto& f : loc.at("features")) {
    pos[f.at("properties").at("mmsi").get<long>()] = &f;
  }

  std::vector<nlohmann::json> matched;
  std::vector<nlohmann::json> spoofers;  // broadcast name != sanctioned name
  for (const auto& v : ves) {
    const long imo_num = v.value("imo", 0L);
    if (imo_num == 0) continue;
    const std::string imo = std::to_string(imo_num);
    const auto reg = registry.find(imo);
    if (reg == registry.end()) continue;
    const auto p = pos.find(v.value("mmsi", 0L));
    if (p == pos.end()) continue;

    const auto& coords = p->second->at("geometry").at("coordinates");
    const std::string ais_name = v.value("name", "");
    const std::string ofac_name = reg->second.value("name", "");
    const int length =
        v.value("referencePointA", 0) + v.value("referencePointB", 0);

    nlohmann::json rec = {
        {"id", "ais-" + imo},
        {"lat", coords[1].get<double>()},
        {"lon", coords[0].get<double>()},
        {"time", iso8601(p->second->at("properties").value("timestampExternal", 0L))},
        {"imo", imo},
        {"size_m", length},
        {"cog", p->second->at("properties").value("cog", 0.0)},
        {"ais_name", ais_name},
        {"flag", ais_name != ofac_name ? "SPOOFER" : "DARK"},
    };
    (ais_name != ofac_name ? spoofers : matched).push_back(std::move(rec));
  }

  // Prefer the identity-laundering cases — they tell the best story.
  std::vector<nlohmann::json> out = std::move(spoofers);
  for (auto& r : matched) out.push_back(std::move(r));
  if (out.size() > limit) out.resize(limit);
  return out;
}

}  // namespace mesh

#endif  // SHADOWMESH_AIS_HPP
