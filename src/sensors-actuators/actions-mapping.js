class ActionsMapping {
    #mapping;
    #idCounter;

    constructor() {
        this.#mapping = [];
        this.#idCounter = 0;
    }

    clear() {
        this.#mapping = [];
        this.#idCounter = 0;
    }

    isValidId(id) {
        return id < this.#mapping.length;
    }

    getActionElem(id) {
        return this.#mapping[id].elem;
    }

    getActionType(id) {
        return this.#mapping[id].type;
    }

    addAction(elem, type) {
        this.#mapping[this.#idCounter] = { elem, type }
        this.#idCounter++;
        return this.#idCounter - 1;
    }
}

module.exports = new ActionsMapping()