"""Shared tabby-cat parts for `cat-stand-cc` and `cat-sleep-cc` (Claude Code versions).

The head is modelled once around the standing cat's head centre and moved as a unit, so both poses share
the same face, ears, colours and stripe rules. Coordinates are glTF metres (face looks toward +Z).
"""
from __future__ import annotations

import math

import cc_common as k
import character_common as cc
from mathutils import Vector

ORANGE, STRIPE, CREAM, PINK = "#E8812F", "#BD5716", "#F6D8AE", "#EE9E96"
HEAD = Vector((0.0, 0.398, 0.200))  # standing head centre; other poses pass an offset from here


def banded(value: float, period: float, width: float) -> bool:
    """True inside a stripe: `width` is the stripe's share of each period (0..1)."""
    return (value / period) % 1.0 < width


def leg_paint(p: Vector, n: Vector) -> str:
    if p.y < 0.055:
        return CREAM
    return STRIPE if banded(p.y + 0.3, 0.058, 0.38) else ORANGE


def tail_paint(path: list[tuple[float, float, float]]):
    pts = [Vector(t) for t in path]

    def paint(p: Vector, n: Vector) -> str:
        best, best_s, travelled = math.inf, 0.0, 0.0
        for a, b in zip(pts, pts[1:]):
            seg = b - a
            t = max(0.0, min(1.0, (p - a).dot(seg) / seg.length_squared))
            d = (a + seg * t - p).length
            if d < best:
                best, best_s = d, travelled + seg.length * t
            travelled += seg.length
        if best_s > travelled - 0.06:
            return CREAM
        return STRIPE if banded(best_s + 0.01, 0.062, 0.45) else ORANGE
    return paint


def head_paint(offset: Vector):
    def paint(p: Vector, n: Vector) -> str:
        p = p - offset
        if (p.y < 0.388 and n.z > 0.05 and abs(p.x) < 0.085) or p.y < 0.338:
            return CREAM  # muzzle, lower cheeks, chin
        if p.y > 0.418 and n.y > 0.25 and abs(p.x) < 0.055 and banded(p.x + 0.3, 0.034, 0.36):
            return STRIPE  # forehead "M"
        if abs(p.x) > 0.075 and 0.37 < p.y < 0.43 and banded(p.y, 0.028, 0.4):
            return STRIPE  # cheek stripes
        return ORANGE
    return paint


def ear_triangle(side: int, offset: Vector):
    bx, by = side * 0.066 + offset.x, 0.438 + offset.y
    return (bx - 0.044, by), (bx + 0.044, by), (side * 0.100 + offset.x, 0.552 + offset.y)


def ear_paint(offset: Vector):
    def paint(p: Vector, n: Vector) -> str:
        """Pink only inside a smaller inner triangle on the front face; the rim stays orange."""
        if n.z < 0.3:
            return ORANGE
        a, b, c = ear_triangle(1 if p.x > offset.x else -1, offset)
        gx, gy = (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3
        a, b, c = [(gx + (q[0] - gx) * 0.62, gy - 0.006 + (q[1] - gy) * 0.62) for q in (a, b, c)]

        def edge(u, v):
            return (v[0] - u[0]) * (p.y - u[1]) - (v[1] - u[1]) * (p.x - u[0])
        d1, d2, d3 = edge(a, b), edge(b, c), edge(c, a)
        inside = (d1 >= 0 and d2 >= 0 and d3 >= 0) or (d1 <= 0 and d2 <= 0 and d3 <= 0)
        return PINK if inside else ORANGE
    return paint


def add_head(clay: list, placeholder, offset: Vector) -> None:
    """Skull, cheeks, muzzle and ears around HEAD + offset, appended to `clay` with their paint rules."""
    o = offset
    paint = head_paint(o)

    def at(x, y, z):
        return (x + o.x, y + o.y, z + o.z)

    parts: list = []
    cc.add_ellipsoid(parts, "skull", (0.200, 0.160, 0.165), at(0, 0.398, 0.200), placeholder, 28, 14)
    for side in (-1, 1):
        cc.add_ellipsoid(parts, f"cheek-{side}", (0.105, 0.090, 0.100), at(side * 0.068, 0.372, 0.214),
                         placeholder, 16, 8)
    cc.add_ellipsoid(parts, "muzzle", (0.088, 0.062, 0.070), at(0, 0.366, 0.278), placeholder, 16, 8)
    clay.extend((obj, paint) for obj in parts)

    ears: list = []
    for side in (-1, 1):
        a, b, c = ear_triangle(side, o)
        bz = 0.182 + o.z
        front, back = 0.014, -0.024
        verts = [(a[0], a[1], bz + front), (b[0], b[1], bz + front), (c[0], c[1], bz - 0.006),
                 (a[0], a[1], bz + back), (b[0], b[1], bz + back), (c[0], c[1], bz - 0.018)]
        faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
        cc.add_mesh(ears, f"ear-{side}", verts, faces, [placeholder], smooth=False)
    clay.extend((obj, ear_paint(o)) for obj in ears)


def add_face(body, offset: Vector, asleep: bool) -> list:
    """Eyes (open, or closed arcs), nose and mouth, projected onto `body`."""
    o = offset
    line_dark = k.mat("Cat eye line", "#3A2518", 0.5)
    nose = k.mat("Cat nose", "#D9776F", 0.5)
    line = k.mat("Cat mouth", "#6A3B26", 0.6)
    decals: list = []
    z = 0.42 + o.z
    for side in (-1, 1):
        ex, ey = side * 0.050 + o.x, 0.405 + o.y
        if asleep:
            k.wrap_onto(k.ribbon_decal(decals, f"closed-eye-{side}",
                                       k.arc_points((ex, ey + 0.004), 0.019, -0.010, z, 11), 0.0055, line_dark),
                        body, 0.0014)
            continue
        iris = k.mat("Cat iris", "#93A63A", 0.35)
        pupil = k.mat("Cat pupil", "#1B120D", 0.3)
        shine = k.mat("Cat eye shine", "#FFFDF4", 0.3)
        for obj, off in (
            (k.disc_decal(decals, f"eye-ring-{side}", (ex, ey + 0.001, z), (0.056, 0.062), line_dark,
                          tilt=side * 0.12), 0.0012),
            (k.disc_decal(decals, f"iris-{side}", (ex, ey, z), (0.047, 0.053), iris, tilt=side * 0.12), 0.0022),
            (k.disc_decal(decals, f"pupil-{side}", (ex - side * 0.004, ey - 0.001, z), (0.022, 0.036), pupil,
                          2, 14), 0.0032),
            (k.disc_decal(decals, f"shine-{side}", (ex - side * 0.010, ey + 0.011, z), (0.009, 0.010), shine,
                          1, 10), 0.0042),
        ):
            k.wrap_onto(obj, body, off)
    k.wrap_onto(k.poly_decal(decals, "nose", [(-0.013 + o.x, 0.378 + o.y), (0.013 + o.x, 0.378 + o.y),
                                              (o.x, 0.364 + o.y)], z, nose, 2), body, 0.0015)
    k.wrap_onto(k.ribbon_decal(decals, "philtrum", [(o.x, 0.366 + o.y, z), (o.x, 0.357 + o.y, z)], 0.0035, line,
                               False), body, 0.0014)
    for side in (-1, 1):
        k.wrap_onto(k.ribbon_decal(decals, f"mouth-{side}",
                                   k.arc_points((side * 0.012 + o.x, 0.357 + o.y), 0.012, -0.007, z, 9),
                                   0.0038, line), body, 0.0014)
    return decals
