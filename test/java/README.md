# Self-authored J2ME regression fixtures

`InstantCheckpointMidlet.java` and `instant-checkpoint.mf` are new project-authored test inputs. They contain no third-party game, vendor runtime, BIOS, or proprietary content. These two new fixture files are dedicated to the public domain under CC0-1.0.

The core build compiles them into ignored `.cache/test-runtime/` JARs. These JARs are not part of the runtime or release assets. The lifecycle fixture exercises RMS persistence; the instant-checkpoint fixture intentionally never serializes its in-memory position and must fail the execution-checkpoint admission check with the existing RMS-only API.
