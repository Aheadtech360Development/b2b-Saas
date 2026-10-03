"""Names a handler reaches for that nothing has put within reach.

The gang sheet checkout called stripe_mode.publishable_key for months on a
module that never imported stripe_mode. It raised NameError on every single
payment, after the charge had been set up at Stripe — and the buyer saw a card
form that would not load. Nothing catches this: Python only finds out when the
line runs, and the line only runs at the very end of a real checkout.
"""
import ast, builtins, pathlib, sys

ROOT = pathlib.Path("app")
problems = []

for path in sorted(ROOT.rglob("*.py")):
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError as exc:
        problems.append(f"{path}: cannot parse — {exc}")
        continue

    top = set(dir(builtins)) | {"__name__", "__file__", "self", "cls"}
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for a in node.names:
                top.add((a.asname or a.name).split(".")[0])
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            top.add(node.name)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    top.add(t.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            top.add(node.target.id)

    # Only functions that stand on their own. A nested one sees everything its
    # parent defined, and following that properly is a scope analyser — more
    # than this needs to be. Every real case found so far was top level.
    def standalone(node):
        out = []
        for child in node.body:
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                out.append(child)
            elif isinstance(child, ast.ClassDef):
                out.extend(m for m in child.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)))
        return out

    for fn in standalone(tree):
        local = set(top)
        for n in ast.walk(fn):
            if isinstance(n, (ast.Import, ast.ImportFrom)):
                for a in n.names:
                    local.add((a.asname or a.name).split(".")[0])
            elif isinstance(n, ast.arg):
                local.add(n.arg)
            elif isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
                local.add(n.id)
            elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                local.add(n.name)
            elif isinstance(n, ast.ExceptHandler) and n.name:
                local.add(n.name)
            elif isinstance(n, ast.comprehension) and isinstance(n.target, ast.Name):
                local.add(n.target.id)
            elif isinstance(n, ast.Global):
                local.update(n.names)
        # Only attribute access on a bare name — foo.bar() — which is how a
        # missing module import shows up.
        nested = {id(x) for f in ast.walk(fn)
                  if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef)) and f is not fn
                  for x in ast.walk(f)}
        for n in ast.walk(fn):
            if id(n) in nested:
                continue
            if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name):
                name = n.value.id
                if name not in local:
                    problems.append(f"{path}:{n.lineno}  {fn.name}() uses {name}.{n.attr} — {name} is never imported")

print(f"scanned {len(list(ROOT.rglob('*.py')))} files")
if problems:
    for p in problems:
        print("  " + p)
    print(f"\n{len(problems)} unreachable name(s)")
    sys.exit(1)
print("no unreachable names")
