
// ═══════════════════════════════════════════════════════════════════════════
// StoreOS Neural Network - WebGPU Compute Shader
// 50,000 particles forming a force-directed graph
// Particles represent: qwen-max (blue), embeddings (violet), actions (emerald), escalations (orange)
// ═══════════════════════════════════════════════════════════════════════════

// Vertex Shader
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) size: f32,
  @location(2) alpha: f32,
};

struct Uniforms {
  time: f32,
  mouseX: f32,
  mouseY: f32,
  resolutionX: f32,
  resolutionY: f32,
  particleCount: f32,
};

@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@binding(1) @group(0) var<storage, read> particles: array<vec4f>;
@binding(2) @group(0) var<storage, read> velocities: array<vec4f>;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let particle = particles[instanceIndex];
  let velocity = velocities[instanceIndex];

  let pos = particle.xy;
  let type = u32(particle.z); // 0=blue, 1=violet, 2=emerald, 3=orange
  let energy = particle.w;

  // Particle type colors
  var color: vec3f;
  switch(type) {
    case 0u: { color = vec3f(0.231, 0.510, 0.965); } // blue #3b82f6
    case 1u: { color = vec3f(0.545, 0.361, 0.965); } // violet #8b5cf6
    case 2u: { color = vec3f(0.063, 0.729, 0.506); } // emerald #10b981
    case 3u: { color = vec3f(0.976, 0.451, 0.086); } // orange #f97316
    default: { color = vec3f(1.0, 1.0, 1.0); }
  }

  // Size based on energy and type
  var size: f32 = 2.0 + energy * 3.0;
  if (type == 0u) { size *= 1.3; } // qwen-max nodes are larger

  // Convert to clip space
  let aspect = uniforms.resolutionX / uniforms.resolutionY;
  let clipPos = vec4f(
    pos.x * 2.0 - 1.0,
    -(pos.y * 2.0 - 1.0) / aspect,
    0.0,
    1.0
  );

  var output: VertexOutput;
  output.position = clipPos;
  output.color = color;
  output.size = size;
  output.alpha = 0.6 + energy * 0.4;

  return output;
}

// Fragment Shader - Glow particle
@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let dist = length(input.position.xy - vec2f(0.0));
  let glow = exp(-dist * dist * 2.0);
  let alpha = input.alpha * glow;
  return vec4f(input.color * (1.0 + glow * 0.5), alpha);
}

// ═══════════════════════════════════════════════════════════════════════════
// Compute Shader - Force-directed graph simulation
// ═══════════════════════════════════════════════════════════════════════════

@compute @workgroup_size(256)
fn cs_update(@builtin(global_invocation_id) globalId: vec3u) {
  let idx = globalId.x;
  let count = u32(uniforms.particleCount);
  if (idx >= count) { return; }

  let particle = particles[idx];
  var pos = particle.xy;
  let type = u32(particle.z);
  var vel = velocities[idx].xy;

  // Mouse repulsion/attraction
  let mousePos = vec2f(uniforms.mouseX, uniforms.mouseY);
  let mouseDist = distance(pos, mousePos);
  if (mouseDist < 0.15 && mouseDist > 0.001) {
    let mouseForce = (pos - mousePos) / mouseDist * 0.0008;
    vel += mouseForce;
  }

  // Attraction to center based on type (form logo shape)
  var targetPos: vec2f;
  let time = uniforms.time;
  let angle = f32(idx) / f32(count) * 6.28318 + time * 0.1;

  switch(type) {
    case 0u: { // qwen-max - form "S" shape
      let t = f32(idx) / f32(count);
      targetPos = vec2f(
        0.5 + sin(t * 6.28318 * 2.0) * 0.15,
        0.5 + cos(t * 6.28318) * 0.2
      );
    }
    case 1u: { // embeddings - orbiting ring
      targetPos = vec2f(
        0.5 + cos(angle) * 0.25,
        0.5 + sin(angle) * 0.25
      );
    }
    case 2u: { // actions - inner cluster
      targetPos = vec2f(
        0.5 + cos(angle * 3.0) * 0.1,
        0.5 + sin(angle * 3.0) * 0.1
      );
    }
    case 3u: { // escalations - scattered outer
      targetPos = vec2f(
        0.5 + cos(angle * 0.5 + 1.0) * 0.35,
        0.5 + sin(angle * 0.5 + 2.0) * 0.35
      );
    }
    default: { targetPos = vec2f(0.5, 0.5); }
  }

  // Spring force toward target
  let toTarget = targetPos - pos;
  vel += toTarget * 0.001;

  // Repulsion from other particles (simplified - only check nearby)
  for (var i: u32 = 0; i < count; i += 1) {
    if (i == idx) { continue; }
    let other = particles[i];
    let diff = pos - other.xy;
    let dist = length(diff);
    if (dist < 0.05 && dist > 0.001) {
      vel += normalize(diff) * 0.0001 / dist;
    }
  }

  // Damping
  vel *= 0.98;

  // Update position
  pos += vel;

  // Boundary wrap
  pos = fract(pos + vec2f(10.0, 10.0));

  // Store updated values
  particles[idx] = vec4f(pos, particle.z, particle.w);
  velocities[idx] = vec4f(vel, velocities[idx].z, velocities[idx].w);
}

// ═══════════════════════════════════════════════════════════════════════════
// Line Shader - Connections between nearby particles
// ═══════════════════════════════════════════════════════════════════════════

struct LineVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) alpha: f32,
};

@vertex
fn vs_line(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> LineVertexOutput {
  // Line instances connect particle pairs
  let p1 = particles[instanceIndex * 2];
  let p2 = particles[instanceIndex * 2 + 1];

  let aspect = uniforms.resolutionX / uniforms.resolutionY;
  let pos = select(p1.xy, p2.xy, vertexIndex == 1);

  let clipPos = vec4f(
    pos.x * 2.0 - 1.0,
    -(pos.y * 2.0 - 1.0) / aspect,
    0.0,
    1.0
  );

  let dist = distance(p1.xy, p2.xy);
  let alpha = max(0.0, 1.0 - dist * 10.0) * 0.15;

  // Mix colors
  let type1 = u32(p1.z);
  let type2 = u32(p2.z);
  var color: vec3f;
  switch(type1) {
    case 0u: { color = vec3f(0.231, 0.510, 0.965); }
    case 1u: { color = vec3f(0.545, 0.361, 0.965); }
    case 2u: { color = vec3f(0.063, 0.729, 0.506); }
    case 3u: { color = vec3f(0.976, 0.451, 0.086); }
    default: { color = vec3f(1.0); }
  }

  var output: LineVertexOutput;
  output.position = clipPos;
  output.color = color;
  output.alpha = alpha;
  return output;
}

@fragment
fn fs_line(input: LineVertexOutput) -> @location(0) vec4f {
  return vec4f(input.color, input.alpha);
}
