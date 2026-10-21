---
name: scipy-numerical-methods
description: "Numerical mathematics and computational physics using official SciPy tutorials: quadrature and ODE integration, linear algebra, constrained optimization, FFT and signal analysis, with convergence and conditioning checks."
license: BSD-3-Clause
---

# scipy-numerical-methods

This is a locally authored DeepSeek Science knowledge adapter, not an upstream agent skill. The official upstream documents below are copied without modification from https://github.com/scipy/scipy at 675e76a9c7f843ebbfa85bb6ee5a2d4ef1457c4e. This subset is portable documentation; the scientific library, full documentation site, datasets and execution environment are not installed by this adapter.

Classify the mathematical problem before selecting a solver. Record units, scaling, initial or boundary conditions and any constraints. For quadrature and ODEs, choose tolerances appropriate to data accuracy, examine status/error estimates and repeat with tighter tolerances or an independent method to establish convergence. Distinguish stiff from nonstiff dynamics; inspect conservation laws when the model implies them. For linear algebra, inspect rank/conditioning and prefer solves over explicit inverses. For optimization, separate local from global claims, check feasibility and residuals, and examine sensitivity to initialization. For FFT and filters, state sampling rate, units, normalization, windowing and aliasing limits. Preserve version, inputs, solver options and diagnostics; do not equate solver success with physical correctness.

## Preserved official resources

- [doc/source/tutorial/_LaTeXMathMacros.rst](../../doc/source/tutorial/_LaTeXMathMacros.rst)
- [doc/source/tutorial/examples/newton_krylov_preconditioning.py](../../doc/source/tutorial/examples/newton_krylov_preconditioning.py)
- [doc/source/tutorial/fft.rst](../../doc/source/tutorial/fft.rst)
- [doc/source/tutorial/integrate.rst](../../doc/source/tutorial/integrate.rst)
- [doc/source/tutorial/interpolate.rst](../../doc/source/tutorial/interpolate.rst)
- [doc/source/tutorial/linalg.rst](../../doc/source/tutorial/linalg.rst)
- [doc/source/tutorial/optimize.rst](../../doc/source/tutorial/optimize.rst)
- [doc/source/tutorial/signal.rst](../../doc/source/tutorial/signal.rst)

Check the installed library version and current official documentation before execution. Report assumptions, numerical tolerances, diagnostics and limitations. Do not present a copied example or successful parse as an executed scientific result.
