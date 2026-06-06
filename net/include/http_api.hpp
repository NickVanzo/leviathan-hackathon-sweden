#ifndef SHADOWMESH_HTTP_API_HPP
#define SHADOWMESH_HTTP_API_HPP

// Browser-facing HTTP API for a node (cpp-httplib). Read routes the map/panel
// consume, plus a POST to inject a detection (the operator action that gossip
// then propagates). CORS is wide open because the Next.js dev server is a
// different origin. Blocks the calling thread until the process is killed —
// that Ctrl-C is the "kill a node" of the demo.

#include <atomic>
#include <iostream>
#include <string>

#include "httplib.h"
#include "json.hpp"
#include "node.hpp"

namespace mesh {

inline void with_cors(httplib::Response& res) {
  res.set_header("Access-Control-Allow-Origin", "*");
  res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set_header("Access-Control-Allow-Headers", "Content-Type");
}

inline void serve_http(Node& node, int port) {
  httplib::Server server;

  // CORS preflight for the POST.
  server.Options(R"(.*)", [](const httplib::Request&, httplib::Response& res) {
    with_cors(res);
  });

  // Liveness + record count. The node panel polls this to show alive/dead.
  server.Get("/health", [&node](const httplib::Request&, httplib::Response& res) {
    const nlohmann::json body = {{"id", node.id()},
                                 {"records", node.size()},
                                 {"rejected", node.rejected()}};
    with_cors(res);
    res.set_content(body.dump(), "application/json");
  });

  // The signed records the map plots.
  server.Get("/detections", [&node](const httplib::Request&, httplib::Response& res) {
    with_cors(res);
    res.set_content(node.all().dump(), "application/json");
  });

  // Inject a new detection here. The node self-signs it, then gossip carries it
  // to peers. Body: {lat, lon, flag, [imo], [track_id], [status], [size_m],
  // [scene], [time], [id]}. An operator confirmation is just a POST with
  // status:"CONFIRMED" sharing the candidate's track_id.
  server.Post("/detections", [&node](const httplib::Request& req,
                                      httplib::Response& res) {
    with_cors(res);
    nlohmann::json body;
    try {
      body = nlohmann::json::parse(req.body);
    } catch (const std::exception&) {
      res.status = 400;
      res.set_content(R"({"error":"invalid JSON"})", "application/json");
      return;
    }
    if (!body.contains("lat") || !body.contains("lon") || !body.contains("flag")) {
      res.status = 400;
      res.set_content(R"({"error":"lat, lon and flag are required"})",
                      "application/json");
      return;
    }
    if (!body.contains("id")) {
      static std::atomic<unsigned> seq{0};
      body["id"] = node.id() + "-inj-" + std::to_string(++seq);
    }
    node.sign_and_store(body);
    res.status = 201;
    res.set_content(nlohmann::json{{"id", body["id"]}}.dump(), "application/json");
  });

  std::cout << "serving http://127.0.0.1:" << port
            << "  (GET /health, /detections; POST /detections)" << std::endl;
  if (!server.listen("127.0.0.1", port)) {
    throw std::runtime_error("failed to bind port " + std::to_string(port));
  }
}

}  // namespace mesh

#endif  // SHADOWMESH_HTTP_API_HPP
