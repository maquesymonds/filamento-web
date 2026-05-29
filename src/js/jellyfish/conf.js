// Stub conf — replaces tweakpane-based conf.js from aurelia-master.
// All visual params are fixed at design-time values; no GUI is created.
export const conf = {
    roughness:          0.4,
    metalness:          0.2,
    transmission:       0.7,
    color:              0xffffff,
    iridescence:        0.0,
    iridescenceIOR:     2.33,
    clearcoat:          0.0,
    clearcoatRoughness: 0.0,
    runSimulation:      true,
    showVerletSprings:  false,
    init()   {},
    update() {},
    begin()  {},
    end()    {},
}
