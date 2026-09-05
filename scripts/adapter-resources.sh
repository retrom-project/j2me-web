#!/usr/bin/env bash
# Keep upstream demo games and prebuilt libraries out of the runtime. The only
# nested JAR is FreeJ2ME Plus, compiled from its pinned source by the builder.
copy_adapter_resources() {
  local source=$1 destination=$2 resource
  local resources=(
    12txt.fnt 12txt_0.png config.txt j2meemu.png
    glsl/m3g_common.frag.glsl glsl/m3g_mesh.vert.glsl glsl/m3g_skin.vert.glsl
    glsl/micro3d.frag.glsl glsl/micro3d.vert.glsl
  )
  for resource in "${resources[@]}"; do
    if [[ ! -f "$source/$resource" || -L "$source/$resource" || -L "$source/glsl" ]]; then
      echo "Invalid adapter resource: $resource" >&2
      return 1
    fi
  done
  for resource in "${resources[@]}"; do
    mkdir -p "$destination/$(dirname "$resource")"
    cp "$source/$resource" "$destination/$resource"
  done
}
