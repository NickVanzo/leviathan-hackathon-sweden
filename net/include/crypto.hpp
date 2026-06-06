#ifndef SHADOWMESH_CRYPTO_HPP
#define SHADOWMESH_CRYPTO_HPP

// Ed25519 record signing for the mesh. The signature covers a FIXED field
// concatenation (not the JSON blob) so signer and verifier always hash identical
// bytes regardless of JSON key order or whitespace. lat/lon use a fixed 6-dp
// format for the same reason. Reused by every node in Slices 1 and 2.

#include <cstdio>
#include <cstring>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <sodium.h>

#include "json.hpp"

namespace mesh {

using Bytes = std::vector<unsigned char>;

struct KeyPair {
  Bytes pk;  // crypto_sign_PUBLICKEYBYTES
  Bytes sk;  // crypto_sign_SECRETKEYBYTES
};

inline std::string to_b64(const Bytes& bin) {
  const int variant = sodium_base64_VARIANT_ORIGINAL;
  std::string out(sodium_base64_encoded_len(bin.size(), variant), '\0');
  sodium_bin2base64(out.data(), out.size(), bin.data(), bin.size(), variant);
  out.resize(std::strlen(out.c_str()));
  return out;
}

inline Bytes from_b64(const std::string& b64) {
  const int variant = sodium_base64_VARIANT_ORIGINAL;
  Bytes out(b64.size());
  size_t real_len = 0;
  if (sodium_base642bin(out.data(), out.size(), b64.data(), b64.size(), nullptr,
                        &real_len, nullptr, variant) != 0) {
    throw std::runtime_error("invalid base64");
  }
  out.resize(real_len);
  return out;
}

inline KeyPair gen_keypair() {
  KeyPair kp;
  kp.pk.resize(crypto_sign_PUBLICKEYBYTES);
  kp.sk.resize(crypto_sign_SECRETKEYBYTES);
  crypto_sign_keypair(kp.pk.data(), kp.sk.data());
  return kp;
}

// id|lat|lon|time|flag|origin|imo|status — the bytes that get signed.
inline std::string canonical(const nlohmann::json& r) {
  char lat[32];
  char lon[32];
  std::snprintf(lat, sizeof(lat), "%.6f", r.value("lat", 0.0));
  std::snprintf(lon, sizeof(lon), "%.6f", r.value("lon", 0.0));
  return r.value("id", "") + "|" + lat + "|" + lon + "|" + r.value("time", "") +
         "|" + r.value("flag", "") + "|" + r.value("origin", "") + "|" +
         r.value("imo", "") + "|" + r.value("status", "");
}

inline std::string sign(const nlohmann::json& r, const Bytes& sk) {
  const std::string msg = canonical(r);
  Bytes sig(crypto_sign_BYTES);
  crypto_sign_detached(sig.data(), nullptr,
                       reinterpret_cast<const unsigned char*>(msg.data()),
                       msg.size(), sk.data());
  return to_b64(sig);
}

inline bool verify(const nlohmann::json& r, const std::string& sig_b64,
                   const std::string& pub_b64) {
  const std::string msg = canonical(r);
  const Bytes sig = from_b64(sig_b64);
  const Bytes pk = from_b64(pub_b64);
  if (sig.size() != crypto_sign_BYTES || pk.size() != crypto_sign_PUBLICKEYBYTES) {
    return false;
  }
  return crypto_sign_verify_detached(
             sig.data(), reinterpret_cast<const unsigned char*>(msg.data()),
             msg.size(), pk.data()) == 0;
}

// The Ed25519 secret key embeds its public key; recover it without a keyfile.
inline Bytes pk_from_sk(const Bytes& sk) {
  Bytes pk(crypto_sign_PUBLICKEYBYTES);
  crypto_sign_ed25519_sk_to_pk(pk.data(), sk.data());
  return pk;
}

// Load a node's keypair from PATH (base64 secret key, one line). If the file is
// absent, generate a fresh keypair and persist it — so a node keeps its identity
// across restarts (needed for the trusted-key allowlist to mean anything).
inline KeyPair load_or_create_key(const std::string& path) {
  std::ifstream in(path);
  if (in) {
    std::string b64;
    std::getline(in, b64);
    KeyPair kp;
    kp.sk = from_b64(b64);
    if (kp.sk.size() != crypto_sign_SECRETKEYBYTES) {
      throw std::runtime_error("bad keyfile (wrong length): " + path);
    }
    kp.pk = pk_from_sk(kp.sk);
    return kp;
  }
  KeyPair kp = gen_keypair();
  std::ofstream out(path);
  if (!out) {
    throw std::runtime_error("cannot write keyfile: " + path);
  }
  out << to_b64(kp.sk) << "\n";
  return kp;
}

}  // namespace mesh

#endif  // SHADOWMESH_CRYPTO_HPP
