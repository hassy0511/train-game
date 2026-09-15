# Character game-asset QA

## Visual

- [ ] FRONT, RIGHT, BACK, and 3/4 preserve the same character identity
- [ ] head/body ratio and all silhouette-critical forms match the approved design
- [ ] eyes and mouth do not protrude unintentionally
- [ ] limbs, hands, and feet have intentional thickness and shape
- [ ] clothing, hair, hat, ears, and tail follow the approved visual language
- [ ] no unintended gaps or visible intersections remain

## Geometry

- [ ] transforms are intentional and normals face correctly
- [ ] no accidental duplicate faces or vertices
- [ ] no unintended non-manifold areas
- [ ] mirror seams and modifiers are clean and deliberate
- [ ] backup geometry is excluded from export

## Repository and export

- [ ] `assets/blender/<name>.py` regenerates the accepted result headlessly
- [ ] object, material, origin, ground contact, scale, +Y up, and +Z forward comply with the repository
- [ ] polygon, material, texture, and GLB size budgets pass
- [ ] final GLB import test passes
- [ ] individual multi-view preview and 2D-versus-3D comparison exist
- [ ] the score in `docs/CHARACTER_3D_QUALITY_BAR.md` is at least 80/100
