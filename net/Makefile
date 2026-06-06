# Convenience wrapper around CMake. `make` builds the whole project once.

BUILD_DIR := build
SEED := ../data/seed-detections.json

.PHONY: all build run clean rebuild keys mesh rogue

all: build

build:
	cmake -S . -B $(BUILD_DIR) -DCMAKE_BUILD_TYPE=Debug
	cmake --build $(BUILD_DIR)

keys: build
	./scripts/gen-keys.sh

mesh: build
	./scripts/run-mesh.sh

rogue: build
	./scripts/run-rogue.sh

run: build
	./$(BUILD_DIR)/node $(SEED)

clean:
	cmake -E rm -rf $(BUILD_DIR)

rebuild: clean build
