---
name: sympy-classical-mechanics
description: "Non-astronomical physics and mechanical engineering from official SymPy mechanics examples: Lagrange and Kane equations, rigid bodies, constrained multibody motion and linearization, with units and conservation checks."
license: BSD-3-Clause
---

# sympy-classical-mechanics

This is a locally authored DeepSeek Science knowledge adapter, not an upstream agent skill. The official upstream documents below are copied without modification from https://github.com/sympy/sympy at 50e68debd256f0ff52b1856bba54868e5499448e. This subset is portable documentation; the scientific library, full documentation site, datasets and execution environment are not installed by this adapter.

Define reference frames, generalized coordinates and speeds, inertial parameters, applied loads and kinematic constraints explicitly. State a consistent sign convention and unit system. Select Lagrange or Kane methods to match the constrained model, then inspect the mass matrix and forcing terms before integration. Check constraint satisfaction, degrees of freedom, limiting cases, dimensions and applicable energy or momentum conservation. Compare an analytic limiting solution or an independently derived balance equation where possible. Separate symbolic derivation, numerical integration and physical validation; a successful symbolic computation does not validate a real mechanism. Report assumptions and equations in LaTeX.

## Preserved official resources

- [doc/src/modules/physics/mechanics/api/kane_lagrange.rst](../../doc/src/modules/physics/mechanics/api/kane_lagrange.rst)
- [doc/src/tutorials/physics/mechanics/atwoods_machine_example.rst](../../doc/src/tutorials/physics/mechanics/atwoods_machine_example.rst)
- [doc/src/tutorials/physics/mechanics/lin_pend_nonmin_example.rst](../../doc/src/tutorials/physics/mechanics/lin_pend_nonmin_example.rst)
- [doc/src/tutorials/physics/mechanics/rollingdisc_example_kane.rst](../../doc/src/tutorials/physics/mechanics/rollingdisc_example_kane.rst)
- [doc/src/tutorials/physics/mechanics/rollingdisc_example_kane_constraints.rst](../../doc/src/tutorials/physics/mechanics/rollingdisc_example_kane_constraints.rst)
- [doc/src/tutorials/physics/mechanics/rollingdisc_example_lagrange.rst](../../doc/src/tutorials/physics/mechanics/rollingdisc_example_lagrange.rst)

Check the installed library version and current official documentation before execution. Report assumptions, numerical tolerances, diagnostics and limitations. Do not present a copied example or successful parse as an executed scientific result.
