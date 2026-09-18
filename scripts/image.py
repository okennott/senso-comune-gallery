#!/usr/bin/env python3
"""Vectorize and rasterize, with the fidelity said out loud.

    python3 scripts/image.py vectorize IN.png OUT.svg [--mode pixel|embed|trace]
    python3 scripts/image.py rasterize IN.svg OUT.png [--width N] [--on '#F3EBDD']
    python3 scripts/image.py formats
    python3 scripts/image.py selftest

    (or: npm run image -- vectorize brand/mark-lockup.png /tmp/mark.svg)

WHY THIS EXISTS IN THIS REPOSITORY
The mark is a raster with no vector behind it (report, "The mark"), the report
is built from PDFs and PNGs that have to agree with each other, and the icon
set is cut from one artwork. Converting between the two is now a recurring job,
and every tool that does it quietly decides how much fidelity to give away.
This one refuses to decide on your behalf.

    pixel  True vector geometry. Every decoded pixel becomes an integer-aligned
           rectangle, with horizontal runs merged. No quantization, smoothing,
           denoising, recolouring or resampling — and no compression either:
           the output is large, and exact. Use it when a renderer needs vector
           geometry and the pixels must survive.
    embed  The original file, byte for byte, inside an SVG <image>. Visually
           lossless and honest about what it is: a raster in a vector wrapper,
           not a vectorization.
    trace  VTracer infers regions and paths. Compact, and an APPROXIMATION —
           it cannot promise pixel identity, which is why --verify exists.

FORMATS are chosen by the output's extension, not by a flag, so the name of
the file and its contents cannot disagree.

    vector   .svg  .svgz  .pdf  .ps  .eps
    raster   .png  .webp  .jpg  .jpeg  .tif  .tiff

SVG is where the geometry is built; PDF, PS and EPS are that same SVG converted
through Cairo, which is a container change and not a second approximation. Two
things to know about them: the <metadata> audit block only survives in the SVG
containers, because PDF and PostScript have nowhere to keep it, and a pixel-mode
page of a million rectangles is a million rectangles in PDF too — for print,
trace or embed is almost always what is wanted.

The input file is never modified, and SVG output carries a <metadata> block
naming the source, its SHA-256 and the mode, so a derived file can always be
traced back to what it came from.

Adapted from the raster_vectorize.py research notes, with three changes: a
rasterize direction, because half the conversions here go the other way; error
metrics in numpy rather than a per-byte Python loop, which took minutes on a
1536x1024 source and now takes milliseconds; and a selftest, so a tool nobody
has run for six months still works when someone needs it.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import io
import json
import mimetypes
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

GENERATOR = "scripts/image.py"

# Chosen by extension. SVG and SVGZ are written directly; the other three are
# that SVG converted by Cairo, which is a container change, not a re-trace.
SVG_NATIVE = {".svg", ".svgz"}
VECTOR_VIA_CAIRO = {".pdf": "svg2pdf", ".ps": "svg2ps", ".eps": "svg2eps"}
VECTOR = SVG_NATIVE | set(VECTOR_VIA_CAIRO)
# Pillow writes these; the renderer always produces PNG first.
RASTER = {".png": "PNG", ".webp": "WEBP", ".jpg": "JPEG", ".jpeg": "JPEG",
          ".tif": "TIFF", ".tiff": "TIFF"}
FLATTENS = {"JPEG"}          # formats with no alpha channel to keep


# ---------------------------------------------------------------- reading

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_rgba(path: Path, honor_exif: bool = True):
    """Decode to RGBA. This is a channel-layout decode, not enhancement."""
    with Image.open(path) as src:
        fmt, info, mode = src.format, dict(src.info), src.mode
        frames = getattr(src, "n_frames", 1)
        if frames != 1:
            raise SystemExit(f"Animated input ({frames} frames) is not supported.")
        img = src.copy()
    if honor_exif:
        img = ImageOps.exif_transpose(img)
    return img.convert("RGBA"), {
        "format": fmt,
        "original_mode": mode,
        "icc_profile_present": bool(info.get("icc_profile")),
        "exif_present": bool(info.get("exif")),
    }


def read_svg_bytes(path: Path) -> bytes:
    if path.suffix.lower() == ".svgz":
        with gzip.open(path, "rb") as f:
            return f.read()
    return path.read_bytes()


def _open_svg_text(path: Path):
    if path.suffix.lower() == ".svgz":
        return gzip.open(path, "wt", encoding="utf-8", newline="\n")
    return path.open("w", encoding="utf-8", newline="\n")


def _prelude(out, w: int, h: int, metadata: dict) -> None:
    meta = json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
    meta = meta.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    out.write('<?xml version="1.0" encoding="UTF-8"?>\n')
    out.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
              f'viewBox="0 0 {w} {h}" shape-rendering="crispEdges">\n')
    out.write(f"  <metadata>{meta}</metadata>\n")


# ---------------------------------------------------------------- vectorize

def vectorize_pixels(img: Image.Image, output: Path, metadata: dict) -> int:
    """Exact RGBA pixels as vector rectangles, run-length merged per row.

    The run boundaries are found with numpy — a 1536-wide row compared in
    Python is a million comparisons an image, and there is no reason to pay it.
    """
    a = np.asarray(img, dtype=np.uint8)
    h, w, _ = a.shape
    rects = 0
    with _open_svg_text(output) as out:
        _prelude(out, w, h, metadata)
        out.write('  <g stroke="none">\n')
        for y in range(h):
            row = a[y]
            # a run ends wherever the pixel differs from the one before it
            change = np.any(row[1:] != row[:-1], axis=1)
            starts = np.flatnonzero(np.r_[True, change])
            ends = np.r_[starts[1:], w]
            for x0, x1 in zip(starts.tolist(), ends.tolist()):
                r, g, b, al = (int(v) for v in row[x0])
                fill = f"#{r:02x}{g:02x}{b:02x}"
                if al == 255:
                    out.write(f'    <rect x="{x0}" y="{y}" width="{x1 - x0}" height="1" fill="{fill}"/>\n')
                else:
                    o = f"{al / 255.0:.12f}".rstrip("0").rstrip(".") or "0"
                    out.write(f'    <rect x="{x0}" y="{y}" width="{x1 - x0}" height="1" '
                              f'fill="{fill}" fill-opacity="{o}"/>\n')
                rects += 1
        out.write("  </g>\n</svg>\n")
    return rects


def vectorize_embed(source: Path, output: Path, w: int, h: int, metadata: dict) -> None:
    raw = source.read_bytes()
    mime = mimetypes.guess_type(source.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(raw).decode("ascii")
    with _open_svg_text(output) as out:
        _prelude(out, w, h, metadata)
        out.write(f'  <image x="0" y="0" width="{w}" height="{h}" '
                  f'preserveAspectRatio="none" href="data:{mime};base64,{encoded}"/>\n')
        out.write("</svg>\n")


# VTracer's Python binding has two shapes in the wild. 0.6.x exposes plain
# functions; the 1.0 alphas expose a Config object. Both are supported, because
# which one a machine has is not something this project gets to decide — and a
# tool that only works on the author's laptop is not a tool.
#
# 0.6.x has no built-in presets either, so these are THIS PROJECT'S parameter
# sets, named for what they are for rather than borrowed from a preset list
# that does not exist:
#
#   faithful  pixel mode, nothing filtered, full colour precision. As close to
#             the source as tracing gets, and still an approximation.
#   photo     splines and a wider layer difference, for continuous tone — a
#             photograph traced at faithful settings is a million tiny regions.
#   poster    fewer colours and more simplification, for flat art.
TRACE_PROFILES = {
    "faithful": dict(colormode="color", hierarchical="cutout", mode="pixel",
                     filter_speckle=0, color_precision=8, layer_difference=0,
                     path_precision=8),
    "photo": dict(colormode="color", hierarchical="cutout", mode="spline",
                  filter_speckle=4, color_precision=8, layer_difference=48,
                  corner_threshold=180, length_threshold=4.0, max_iterations=10,
                  splice_threshold=45, path_precision=8),
    "poster": dict(colormode="color", hierarchical="stacked", mode="spline",
                   filter_speckle=8, color_precision=6, layer_difference=16,
                   corner_threshold=60, length_threshold=4.0, max_iterations=10,
                   splice_threshold=45, path_precision=8),
}


def _trace_svg(img: Image.Image, profile: str) -> str:
    try:
        import vtracer
    except ImportError as exc:
        raise SystemExit("trace mode needs VTracer:  pip install vtracer") from exc
    opts = TRACE_PROFILES[profile]

    if hasattr(vtracer, "convert_pixels_to_svg"):          # 0.6.x
        rgba = list(map(tuple, np.asarray(img).reshape(-1, 4).tolist()))
        return vtracer.convert_pixels_to_svg(rgba, (img.width, img.height), **opts)

    if hasattr(vtracer, "Config"):                          # 1.0 alphas
        cfg = vtracer.Config(**{k: v for k, v in opts.items() if k != "colormode"},
                             clustering="color-cluster")
        return cfg.convert_pixels(img.tobytes(), img.width, img.height)

    raise SystemExit("VTracer is installed but exposes neither convert_pixels_to_svg "
                     "nor Config; this binding is not one image.py knows.")


def vectorize_trace(img: Image.Image, output: Path, metadata: dict, profile: str) -> None:
    svg = _trace_svg(img, profile)
    audit = json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
    audit = audit.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # After the <svg> START TAG, not after the first ">" in the file — VTracer
    # emits an XML declaration and a generator comment first, and metadata
    # placed between them sits outside the root element, which is not a
    # document any parser will read.
    open_tag = svg.find("<svg")
    cut = svg.find(">", open_tag) if open_tag != -1 else -1
    if cut != -1:
        svg = svg[:cut + 1] + f"\n<metadata>{audit}</metadata>" + svg[cut + 1:]
    else:
        raise SystemExit("VTracer returned something that is not an SVG document.")
    if output.suffix.lower() == ".svgz":
        with gzip.open(output, "wt", encoding="utf-8", newline="\n") as f:
            f.write(svg)
    else:
        output.write_text(svg, encoding="utf-8")


def to_vector(svg_path: Path, output: Path) -> None:
    """Convert a written SVG into the container the output name asks for.

    Cairo re-reads the SVG and re-emits the same geometry; nothing is traced
    again and nothing is resampled. What is lost is the <metadata> block: PDF
    and PostScript have nowhere to put it, so the audit trail ends at the SVG.
    """
    import cairosvg
    if output.suffix.lower() in SVG_NATIVE:
        raise ValueError("SVG containers are written directly, not converted")
    getattr(cairosvg, VECTOR_VIA_CAIRO[output.suffix.lower()])(
        bytestring=read_svg_bytes(svg_path), write_to=str(output))


# ---------------------------------------------------------------- rasterize

def rasterize(source: Path, output: Path, width=None, height=None, on=None,
              quality: int = 92) -> tuple[int, int]:
    """SVG or SVGZ to a raster, at a stated size, in the format the output
    name asks for.

    `on` flattens the result onto an opaque colour. Alpha is the commonest
    thing to lose by accident between a vector and the raster someone pastes
    into a document, so losing it is made explicit rather than incidental —
    and a format that cannot carry alpha says so rather than deciding for you.
    """
    import cairosvg
    fmt = RASTER[output.suffix.lower()]
    kw = {}
    if width:
        kw["output_width"] = width
    if height:
        kw["output_height"] = height
    png = cairosvg.svg2png(bytestring=read_svg_bytes(source), **kw)
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    if on:
        bg = tuple(int(on.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
        flat = Image.new("RGBA", im.size, bg)
        flat.alpha_composite(im)
        im = flat.convert("RGB")
    elif fmt in FLATTENS and im.getchannel("A").getextrema()[0] < 255:
        raise SystemExit(f"{output.suffix} cannot carry transparency and the image has some. "
                         f"Pass --on '#RRGGBB' to say what it should sit on, "
                         f"or write .png/.webp/.tif instead.")
    save = {"optimize": True}
    if fmt in {"JPEG", "WEBP"}:
        save["quality"] = quality
    if fmt == "JPEG":
        save.update(progressive=True, subsampling=0)
        im = im.convert("RGB")
    im.save(output, fmt, **save)
    return im.size


# ---------------------------------------------------------------- verifying

def _metrics(a: np.ndarray, b: np.ndarray) -> dict:
    d = np.abs(a.astype(np.int16) - b.astype(np.int16))
    return {
        "exact": bool(d.max() == 0),
        "mae_per_channel": float(d.mean()),
        "rmse_per_channel": float(np.sqrt((d.astype(np.float64) ** 2).mean())),
        "max_channel_error": int(d.max()),
        "exact_channel_fraction": float((d == 0).mean()),
    }


def verify(img: Image.Image, svg_path: Path) -> dict:
    """Rasterize the SVG at native size and compare it with the source.

    A renderer may legitimately rewrite RGB where alpha is low, because most
    composite internally with premultiplied alpha, so the result is also
    compared as it LOOKS over black and over white.
    """
    import cairosvg
    png = cairosvg.svg2png(bytestring=read_svg_bytes(svg_path),
                           output_width=img.width, output_height=img.height)
    rendered = Image.open(io.BytesIO(png)).convert("RGBA")
    if rendered.size != img.size:
        return {"exact": False, "error": f"size mismatch {rendered.size} != {img.size}"}
    src = np.asarray(img)
    out = np.asarray(rendered)
    visual = {}
    for label, bg in (("black", (0, 0, 0, 255)), ("white", (255, 255, 255, 255))):
        a = np.asarray(Image.alpha_composite(Image.new("RGBA", img.size, bg), img).convert("RGB"))
        b = np.asarray(Image.alpha_composite(Image.new("RGBA", img.size, bg), rendered).convert("RGB"))
        visual[label] = _metrics(a, b)
    return {
        "raw_rgba": _metrics(src, out),
        "alpha": _metrics(src[:, :, 3], out[:, :, 3]),
        "visual_composited": visual,
        "note": "Small RGB differences where alpha is low are usually renderer "
                "premultiplication, not a visible change.",
    }


# ---------------------------------------------------------------- selftest

def selftest() -> int:
    """Round-trip two fixtures, both directions, and insist on the right thing.

    pixel mode claims every decoded pixel survives. That is a claim a test can
    settle, so it does — on flat runs, single pixels against a run, and partial
    alpha, which are the three things run-length merging can get wrong.

    The bar is different for the two: an OPAQUE image must come back byte for
    byte, while a partly transparent one is allowed one unit per channel once
    composited, because renderers composite with premultiplied alpha and round.
    That is the reference notes' own caveat, turned into a number.
    """
    import tempfile

    opaque = np.zeros((16, 24, 4), dtype=np.uint8)
    opaque[:, :, 3] = 255
    opaque[:8] = [243, 235, 221, 255]                 # a flat run
    opaque[8:] = [58, 43, 34, 255]                    # and another
    opaque[4, 7] = [139, 74, 60, 255]                 # one pixel against the run
    opaque[12, 3:5] = [150, 155, 125, 255]            # a two-pixel run

    rng = np.random.default_rng(7)
    alpha = opaque.copy()
    alpha[12:, 16:] = rng.integers(0, 256, (4, 8, 4))  # noise, alpha included

    fails = []
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        for name, arr, tol in (("opaque", opaque, 0), ("alpha", alpha, 1)):
            img = Image.fromarray(arr)
            src = d / f"{name}.png"
            img.save(src)
            before = sha256_file(src)

            for mode in ("pixel", "embed"):
                svg = d / f"{name}-{mode}.svg"
                meta = {"generator": GENERATOR, "mode": mode, "source_sha256": before}
                if mode == "pixel":
                    vectorize_pixels(img, svg, meta)
                else:
                    vectorize_embed(src, svg, img.width, img.height, meta)
                r = verify(img, svg)
                err = max(r["visual_composited"]["white"]["max_channel_error"],
                          r["visual_composited"]["black"]["max_channel_error"])
                ok = err <= tol
                print(f"    {name:6} {mode:6} → svg → back: max {err} (allowed {tol})"
                      f"{'' if ok else '   FAILED'}")
                if not ok:
                    fails.append(f"{name}/{mode}")

            png = d / f"{name}-back.png"
            rasterize(d / f"{name}-pixel.svg", png, width=img.width, height=img.height)
            back = Image.open(png).convert("RGBA")
            # Composited, for the same reason verify() composites: a renderer
            # may write anything it likes into RGB where alpha is 0.
            err = max(_metrics(
                np.asarray(Image.alpha_composite(Image.new("RGBA", img.size, bg), img).convert("RGB")),
                np.asarray(Image.alpha_composite(Image.new("RGBA", img.size, bg), back).convert("RGB")),
            )["max_channel_error"] for bg in ((0, 0, 0, 255), (255, 255, 255, 255)))
            ok = err <= tol
            print(f"    {name:6} rasterize → png: max {err} (allowed {tol})"
                  f"{'' if ok else '   FAILED'}")
            if not ok:
                fails.append(f"{name}/rasterize")

            if sha256_file(src) != before:
                fails.append(f"{name}: the input was modified")

        # trace is an approximation, so it is tested for being WIRED UP and
        # bounded rather than for being exact: a real SVG, and a mean error
        # that would catch the profile silently tracing nothing. When VTracer
        # is not installed the line says so — this is the one capability the
        # tool declares that it cannot always have.
        img = Image.fromarray(opaque)
        try:
            for profile in TRACE_PROFILES:
                svg = d / f"trace-{profile}.svg"
                vectorize_trace(img, svg, {"generator": GENERATOR, "mode": "trace"}, profile)
                r = verify(img, svg)
                mae = r["visual_composited"]["white"]["mae_per_channel"]
                ok = svg.stat().st_size > 200 and mae < 40
                print(f"    trace  {profile:<9} mean error {mae:5.2f} of 255"
                      f"{'' if ok else '   FAILED'}")
                if not ok:
                    fails.append(f"trace/{profile}")
        except SystemExit as exc:
            print(f"    trace  not run — {exc}")

        # Every declared vector container actually writes, and writes itself:
        # a format in the list that nobody has run is a format that is not
        # supported, it is only advertised.
        magic = {".pdf": b"%PDF", ".ps": b"%!PS", ".eps": b"%!PS"}
        for ext in sorted(VECTOR):
            out = d / f"container{ext}"
            if ext in SVG_NATIVE:
                vectorize_pixels(img, out, {"generator": GENERATOR, "mode": "pixel"})
            else:
                to_vector(d / "opaque-pixel.svg", out)
            head = read_svg_bytes(out)[:4] if ext == ".svgz" else out.read_bytes()[:4]
            ok = out.stat().st_size > 200 and (ext not in magic or head == magic[ext])
            print(f"    {ext:<6} container: {out.stat().st_size:>8,} bytes"
                  f"{'' if ok else '   FAILED'}")
            if not ok:
                fails.append(ext)

    print("    selftest:", "pass" if not fails else "FAILED — " + ", ".join(fails))
    return 1 if fails else 0


# ---------------------------------------------------------------- cli

def formats() -> int:
    """What can be written, and what each one keeps."""
    rows = [
        (".svg",  "vector", "the geometry, plus the <metadata> audit block"),
        (".svgz", "vector", "the same, gzipped"),
        (".pdf",  "vector", "the geometry; no metadata block — PDF has nowhere for it"),
        (".ps",   "vector", "the geometry, as PostScript"),
        (".eps",  "vector", "the geometry, as encapsulated PostScript, for placing"),
        (".png",  "raster", "lossless, alpha kept"),
        (".webp", "raster", "lossy at --quality, alpha kept"),
        (".tif",  "raster", "lossless, alpha kept"),
        (".jpg",  "raster", "lossy at --quality, NO alpha — needs --on"),
    ]
    print("  Output format is chosen by the extension.\n")
    for ext, kind, note in rows:
        print(f"    {ext:<6} {kind:<7} {note}")
    print("\n  PDF, PS and EPS are the generated SVG converted through Cairo: a container")
    print("  change, not a second approximation. A pixel-mode page of a million")
    print("  rectangles is a million rectangles in PDF too — for print, prefer")
    print("  --mode trace or --mode embed.")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("vectorize", help="raster → vector")
    v.add_argument("input", type=Path)
    v.add_argument("output", type=Path, help=" ".join(sorted(VECTOR)))
    v.add_argument("--mode", choices=("pixel", "embed", "trace"), default="pixel")
    v.add_argument("--trace-profile", choices=("faithful", "photo", "poster"), default="faithful")
    v.add_argument("--raw-orientation", action="store_true",
                   help="ignore EXIF orientation and take the stored matrix literally")
    v.add_argument("--verify", action="store_true", help="render the SVG back and report the error")

    r = sub.add_parser("rasterize", help="vector → raster")
    r.add_argument("input", type=Path)
    r.add_argument("output", type=Path, help=" ".join(sorted(RASTER)))
    r.add_argument("--width", type=int)
    r.add_argument("--height", type=int)
    r.add_argument("--on", help="flatten onto this colour, e.g. '#F3EBDD'")
    r.add_argument("--quality", type=int, default=92, help="JPEG and WebP only")

    sub.add_parser("formats", help="what can be written, and what each one keeps")
    sub.add_parser("selftest", help="round-trip a fixture and insist on exactness")

    args = ap.parse_args(argv)
    if args.cmd == "selftest":
        return selftest()
    if args.cmd == "formats":
        return formats()

    src_path, out_path = args.input.resolve(), args.output.resolve()
    if not src_path.is_file():
        raise SystemExit(f"Input file not found: {src_path}")
    if src_path == out_path:
        raise SystemExit("Refusing to overwrite the input file.")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if args.cmd == "rasterize":
        if src_path.suffix.lower() not in SVG_NATIVE:
            raise SystemExit("rasterize reads .svg or .svgz")
        if out_path.suffix.lower() not in RASTER:
            raise SystemExit(f"rasterize writes {' '.join(sorted(RASTER))}")
        w, h = rasterize(src_path, out_path, args.width, args.height, args.on, args.quality)
        print(f"  {out_path}  {RASTER[out_path.suffix.lower()]} {w}x{h}, "
              f"{out_path.stat().st_size:,} bytes")
        print(f"  source SHA-256: {sha256_file(src_path)}")
        return 0

    if out_path.suffix.lower() not in VECTOR:
        raise SystemExit(f"vectorize writes {' '.join(sorted(VECTOR))}")
    img, source = load_rgba(src_path, honor_exif=not args.raw_orientation)
    digest = sha256_file(src_path)
    metadata = {
        "generator": GENERATOR, "source_filename": src_path.name, "source_sha256": digest,
        "source_format": source["format"], "source_mode": source["original_mode"],
        "width": img.width, "height": img.height, "mode": args.mode,
        "honor_exif_orientation": not args.raw_orientation,
        "icc_profile_present": source["icc_profile_present"],
    }
    if source["icc_profile_present"] and args.mode in {"pixel", "trace"}:
        print("  WARNING: the source carries an ICC profile. pixel and trace keep the decoded\n"
              "  channel values, but SVG fill colours do not carry colour management. Use\n"
              "  --mode embed to keep it, or convert to sRGB deliberately first.", file=sys.stderr)

    # The geometry is always built as SVG. A PDF, PS or EPS target is that
    # same SVG handed to Cairo — one conversion, no second approximation.
    import tempfile
    ext = out_path.suffix.lower()
    with tempfile.TemporaryDirectory() as tmp:
        svg_path = out_path if ext in SVG_NATIVE else Path(tmp) / "geometry.svg"

        if args.mode == "pixel":
            rects = vectorize_pixels(img, svg_path, metadata)
            what = (f"true vector geometry, {img.width}x{img.height}, "
                    f"{rects:,} rectangles after run-length merging")
        elif args.mode == "embed":
            vectorize_embed(src_path, svg_path, img.width, img.height, metadata)
            what = "the original bytes in a vector wrapper — a container, not a vectorization"
        else:
            metadata["trace_profile"] = args.trace_profile
            vectorize_trace(img, svg_path, metadata, args.trace_profile)
            what = f"traced ({args.trace_profile}) — an approximation; use --verify to quantify it"

        verified = verify(img, svg_path) if args.verify else None

        if ext not in SVG_NATIVE:
            to_vector(svg_path, out_path)
            what += f"; converted to {ext[1:].upper()}, where the metadata block cannot follow"

    print(f"  {out_path}  {what}")
    print(f"  source SHA-256: {digest}")
    print(f"  output: {out_path.stat().st_size:,} bytes")
    if verified is not None:
        print("  verified against the SVG geometry, before any container change:")
        print(json.dumps(verified, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
