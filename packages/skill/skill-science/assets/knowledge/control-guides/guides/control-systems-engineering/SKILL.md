---
name: control-systems-engineering
description: "Engineering control analysis from official python-control guides: continuous/discrete state-space and transfer functions, feedback interconnections, stability, time/frequency responses and nonlinear systems, with physical constraints and validation."
license: BSD-3-Clause
---

# control-systems-engineering

This is a locally authored DeepSeek Science knowledge adapter, not an upstream agent skill. The official upstream documents below are copied without modification from https://github.com/python-control/python-control at b4cf7360138985f84afe299337ef9ee6c25e9c38. This subset is portable documentation; the scientific library, full documentation site, datasets and execution environment are not installed by this adapter.

Translate requirements into measurable operating range, bandwidth, tracking error, disturbance rejection and actuator limits. State units, input/output ordering, state meaning, feedback sign and the continuous/discrete timebase. Verify the model against a physical balance or identified data before controller design. Examine controllability, observability, poles/zeros, stability and appropriate robustness margins. Compare open-loop and closed-loop time/frequency responses; account for sampling, delay, saturation, noise and uncertainty. Validate on independent operating points or held-out experiments when possible. Simulation and nominal stability are evidence about the model, not a guarantee for deployed hardware. Report equations, parameters, assumptions and the exact checks actually performed.

## Preserved official resources

- [doc/intro.rst](../../doc/intro.rst)
- [doc/iosys.rst](../../doc/iosys.rst)
- [doc/linear.rst](../../doc/linear.rst)
- [doc/nlsys.rst](../../doc/nlsys.rst)
- [doc/nonlinear.rst](../../doc/nonlinear.rst)
- [doc/optimal.rst](../../doc/optimal.rst)
- [doc/response.rst](../../doc/response.rst)
- [doc/statesp.rst](../../doc/statesp.rst)
- [doc/xferfcn.rst](../../doc/xferfcn.rst)

Check the installed library version and current official documentation before execution. Report assumptions, numerical tolerances, diagnostics and limitations. Do not present a copied example or successful parse as an executed scientific result.
