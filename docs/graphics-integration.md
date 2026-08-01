# Engineering graphics integration

VibeGPT can attach a deterministic engineering drawing to a grounded chat
answer. The drawing engine remains in the adjacent `GraphicsPythonVibeGPT`
repository and runs as the private `graphics` Docker service.

Expected checkout layout:

```text
VibeGPT/
├── VibeGPT/
└── GraphicsPythonVibeGPT/
```

Start the complete local stack from `VibeGPT/VibeGPT/infrastructure`:

```powershell
docker compose up -d --build
```

## Routing and grounding

A drawing is requested only when:

1. The selected or automatically resolved subject name/code identifies an
   Engineering Graphics/Drawing subject.
2. The question contains drawing or projection intent.
3. VibeGPT retrieval finds at least one published chunk in that subject.

VibeGPT sends only those subject-scoped excerpts to the drawing service. The
service extracts a validated drawing specification and the Python engine
renders the SVG. It does not query the VibeGPT database and cannot search
another subject.

The text answer, citations, SVG, drawing specification, and warnings are saved
on the same question log. Students can reopen the chat and download either the
SVG sheet or the validated JSON drawing data.

## Current deterministic coverage

- Prisms and pyramids: triangular, square, pentagonal and hexagonal
- Cube and tetrahedron
- Cone and cylinder
- First-angle successive-position constructions
- H.P./V.P. inclination and common resting-edge/corner/generator conditions
- Simple box/cylinder orthographic and isometric views

Unsupported free-form CSG, slots, complex stepped solids, and unusual auxiliary
plane cases return a normal grounded text answer without a broken drawing.
