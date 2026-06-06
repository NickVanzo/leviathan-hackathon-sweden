cmake_minimum_required(VERSION 3.20)
project(shadowmesh CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# libsodium (Homebrew, no pkg-config) — point straight at the prefix.
find_path(SODIUM_INCLUDE_DIR sodium.h HINTS /opt/homebrew/opt/libsodium/include)
find_library(SODIUM_LIB sodium HINTS /opt/homebrew/opt/libsodium/lib)
if(NOT SODIUM_INCLUDE_DIR OR NOT SODIUM_LIB)
  message(FATAL_ERROR "libsodium not found. Run: brew install libsodium")
endif()

add_executable(node src/main.cpp)
target_include_directories(node PRIVATE include ${SODIUM_INCLUDE_DIR})
target_link_libraries(node PRIVATE ${SODIUM_LIB})

find_package(Threads REQUIRED)
target_link_libraries(node PRIVATE Threads::Threads)
