---
name: blender-character-modeling
description: Create, rebuild, or substantially revise this repository's stylized Blender characters from approved concept art. Use for character reference analysis, silhouette-first blockout, Blender MCP viewport review, deterministic Python generation, multi-view rendering, GLB export, and the 80-point character quality gate.
---

# Blender Character Modeling

Apply this skill together with the repository `AGENTS.md`, `docs/WORLD_ART_DIRECTION.md`, and `docs/CHARACTER_3D_QUALITY_BAR.md`.

## Source priority

Use sources in this order:

1. `assets/concepts/character-deformation-c-strong.png`
2. the matching `assets/concepts/character-turnaround-c-*.png`
3. an approved measured character specification
4. approved prior renders
5. the current mesh
6. agent assumptions

If the current mesh conflicts with the approved 2D design, rebuild it. Existing geometry is not a reason to preserve a weak silhouette.

## Reproducibility contract

- Blender MCP / GUI may be used for inspection, blockout, visual comparison, and controlled experiments.
- The accepted model must be reproducible from `assets/blender/<name>.py`.
- Final GLB and preview generation must run headlessly.
- Do not make an unscripted `.blend` file the source of truth.
- Before destructive MCP edits, save the working file or duplicate the target collection with a clear backup name. Do not touch unrelated scene objects.

## Stage 0: inspect and specify

1. Verify Blender MCP with a harmless scene read. If unavailable, apply `$blender-mcp-bootstrap` and stop before editing.
2. Inspect the scene, hierarchy, current preview, approved concept, and turnaround.
3. Decide whether repair or rebuild is safer. Prefer rebuild when primary forms are wrong.
4. Create a compact measured spec using `references/character-spec-template.md`. Mark unseen values as inferred.

## Stage 1: silhouette blockout

Build only silhouette-critical masses in a neutral material: head, torso, pelvis, limbs, hands, feet, and major ears, tail, hair, hat, cape, or coat.

Do not add face graphics, seams, buttons, fingers, trim, or texture detail yet.

Render FRONT, RIGHT, BACK, and 3/4 under the same orthographic or near-orthographic setup. Gate A fails if head/body ratio, width, depth, limb thickness, foot grounding, or a major accessory silhouette is materially wrong.

## Stage 2: primary forms

Replace temporary primitive stacks with intentional custom geometry where needed. Organic head, torso, hips, muzzle, and animal body contours should read as designed continuous forms, not intersecting spheres and capsules.

Use controlled low-poly cages, bevels, curves, low subdivision levels, smooth shading, and controlled normals when they improve the approved design. Preserve intentional planes and tapers.

Repeat all four views. Treat SIDE as a hard gate for head depth, chest/abdomen/hip flow, limb placement, and accessory thickness.

## Stage 3: face

Add the face only after the head form passes.

- Treat graphic eyes as face-surface forms: conforming thin meshes, shallow insets, or a generated embedded texture.
- Do not default to spherical eyeballs.
- From the side, the eyes must not protrude beyond the intended face silhouette.
- Match spacing, height, expression, mouth/brow relation, and centerline before adding realism.

Repeat FRONT, RIGHT, and 3/4. Do not continue while the character identity or expression is off.

## Stage 4: secondary forms and materials

Add silhouette-impacting hair, clothing, cuffs, shoes, stripes, ornaments, and other character-specific forms before surface-only decoration. Use color to support the geometry, not conceal it. Keep external photo textures and stock character assets out of the model.

## Review loop

At every gate:

1. capture the same canonical views;
2. list the three largest mismatches;
3. classify them as silhouette, proportion, depth, placement, topology, face, or style;
4. fix only one to three structural issues per iteration;
5. recapture and compare;
6. advance only when no critical mismatch remains.

Use `references/visual-review.md` and `references/modeling-rules.md` for the detailed review rules.

## Finalization

1. Encode all accepted construction in the deterministic generation script.
2. Run the repository headless Blender command to regenerate the GLB and preview.
3. Run the checks in `references/game-asset-qa.md` and the repository quality bar.
4. Create one contact sheet containing FRONT, 3/4, RIGHT, and BACK, plus a comparison image of approved 2D versus latest 3D.
5. Score the model using `docs/CHARACTER_3D_QUALITY_BAR.md`.

Do not call a character complete below 80/100 or when silhouette, face, or head/body structure scores below 70% of their category maximum. Do not present an under-threshold render as a finished submission.
