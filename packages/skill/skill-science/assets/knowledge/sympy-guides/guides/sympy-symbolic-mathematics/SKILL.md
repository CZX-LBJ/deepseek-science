---
name: sympy-symbolic-mathematics
description: "Symbolic mathematics using the preserved official SymPy tutorials: exact expressions, assumptions, simplification, algebraic solving, calculus and matrices, with explicit domains and verification by substitution."
license: BSD-3-Clause
---

# sympy-symbolic-mathematics

This is a locally authored DeepSeek Science knowledge adapter, not an upstream agent skill. The official upstream documents below are copied without modification from https://github.com/sympy/sympy at 50e68debd256f0ff52b1856bba54868e5499448e. This subset is portable documentation; the scientific library, full documentation site, datasets and execution environment are not installed by this adapter.

State the variable domains, assumptions, equations and desired mathematical object before choosing an API. Use exact integers and Rational values when exactness matters. Distinguish an expression from an equation, solve from solveset, and a symbolic result from a proof. Preserve branches, singularities and parameter restrictions; check solutions against the original equation. For integration and simplification, report assumptions and verify by differentiation or independent substitution when applicable. For matrices, distinguish symbolic equality, elementwise operations and linear algebra. Deliver readable LaTeX equations and document any numerical approximation separately.

## Preserved official resources

- [doc/src/tutorials/intro-tutorial/basic_operations.rst](../../doc/src/tutorials/intro-tutorial/basic_operations.rst)
- [doc/src/tutorials/intro-tutorial/calculus.rst](../../doc/src/tutorials/intro-tutorial/calculus.rst)
- [doc/src/tutorials/intro-tutorial/gotchas.rst](../../doc/src/tutorials/intro-tutorial/gotchas.rst)
- [doc/src/tutorials/intro-tutorial/matrices.rst](../../doc/src/tutorials/intro-tutorial/matrices.rst)
- [doc/src/tutorials/intro-tutorial/simplification.rst](../../doc/src/tutorials/intro-tutorial/simplification.rst)
- [doc/src/tutorials/intro-tutorial/solvers.rst](../../doc/src/tutorials/intro-tutorial/solvers.rst)

Check the installed library version and current official documentation before execution. Report assumptions, numerical tolerances, diagnostics and limitations. Do not present a copied example or successful parse as an executed scientific result.
