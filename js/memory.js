/**
 * Módulo de gerenciamento de memória para o simulador C99
 * Este arquivo contém a implementação da memória virtual e suas operações
 */

class Memory {
    constructor() {
        this.memory = new Map(); // Memória principal (endereço -> valor)
        this.pointers = new Map(); // Mapeia ponteiros para seus endereços referenciados
        this.variableAddresses = new Map(); // Mapeia nomes de variáveis para seus endereços
        this.variableMetadata = new Map(); // Stores detailed info about variables, including arrays
        this.nextAddress = 0x1000; // Endereço inicial (arbitrário)
        this.stackFrames = []; // Pilha de chamadas de funções
        this.lastReturnValues = {}; // Armazena o último valor de retorno para cada função
    }

    /**
     * Aloca um espaço na memória e retorna o endereço
     * @param {number} size - Tamanho em bytes para alocar
     * @returns {number} Endereço alocado
     */
    allocate(size = 4) {
        const address = this.nextAddress;
        this.nextAddress += size;
        return address;
    }

    /**
     * Declara uma variável e aloca espaço na memória
     * @param {string} name - Nome da variável
     * @param {string} type - Tipo da variável (int, char, etc.)
     * @param {*} initialValue - Valor inicial da variável
     * @param {string} scope - Escopo da variável (nome da função ou 'global')
     * @param {object | null} typeInfoExtra - Contém informações adicionais se for um tipo complexo como array, senão null.
     *                                      Para arrays, espera-se um objeto como:
     *                                      { type: 'array_declaration', varType: 'int', size: 3, initialValue: [1,2,3], dimensions: [3] }
     *                                      O parâmetro `type` original será o `varType` (tipo do elemento) nesse caso.
     *                                      O parâmetro `initialValue` original será ignorado em favor de `typeInfoExtra.initialValue`.
     * @returns {number | undefined} Endereço da variável ou undefined se falhar
     */
    declareVariable(name, typeOrElementType, initialValueForSimpleType = null, scope = 'global') {
        // Verifica se typeOrElementType é um AST node de declaração de array
        if (typeof typeOrElementType === 'object' && typeOrElementType.type === 'array_declaration') {
            const astNode = typeOrElementType;
            const elementType = astNode.varType; // e.g., "int"
            const numElements = astNode.size;    // e.g., 10. Parser deve ter resolvido ou ser simbólico.
            const arrayInitializers = astNode.initialValue; // e.g., [1,2,3] or "\"hello\"" or null

            if (typeof numElements !== 'number' || numElements <= 0) {
                // Se o tamanho for simbólico (string) ou inválido, não podemos alocar de forma simples.
                // O problema especifica foco em tamanhos numéricos ou inferidos.
                console.warn(`Cannot declare array ${scope}:${name} with non-numeric or invalid size: ${numElements}. Allocation skipped.`);
                return undefined;
            }

            const elementSize = this.getSizeForType(elementType);
            if (elementSize === undefined) { // Should not happen with valid types
                console.error(`Unknown element type ${elementType} for array ${scope}:${name}.`);
                return undefined;
            }
            const totalSize = numElements * elementSize;
            const baseAddress = this.allocate(totalSize); // allocate reserves the whole block

            const key = `${scope}:${name}`;
            this.variableAddresses.set(key, baseAddress);
            this.variableMetadata.set(key, {
                type: 'array', // Distinguish from simple types
                elementType: elementType,
                elementSize: elementSize,
                arraySize: numElements, // Number of elements
                address: baseAddress,
                scope: scope,
                name: name
            });

            for (let i = 0; i < numElements; i++) {
                const currentAddress = baseAddress + (i * elementSize);
                let valueToStore = this.getDefaultValueForType(elementType); // Default initialization

                if (arrayInitializers !== null && arrayInitializers !== undefined) {
                    if (Array.isArray(arrayInitializers)) { // Initializer list like {1, 2, 3}
                        if (i < arrayInitializers.length) {
                            valueToStore = this.parseValue(arrayInitializers[i]);
                        }
                    } else if (typeof arrayInitializers === 'string' && elementType === 'char') { // String literal like "hello"
                        const strValue = arrayInitializers.substring(1, arrayInitializers.length - 1); // Remove quotes
                        if (i < strValue.length) {
                            valueToStore = strValue.charCodeAt(i);
                        } else if (i === strValue.length) { // Null terminator
                            valueToStore = 0;
                        }
                        // Padding with default (0) is implicitly handled if numElements > strValue.length + 1
                        // Truncation is handled if numElements < strValue.length + 1 (loop limit)
                    }
                    // Other types of initializers for arrays (e.g. int arr[5] = x;) are not handled here,
                    // as arrayInitializers from parser is expected to be array or string.
                }
                this.memory.set(currentAddress, valueToStore);
            }
            return baseAddress;

        } else if (typeof typeOrElementType === 'string') {
            // Existing logic for simple variables / pointers
            const type = typeOrElementType; // type is a string like "int" or "char*"
            
            const isPointer = type.includes('*');
            const size = this.getSizeForType(type);
            const address = this.allocate(size);
            
            const key = `${scope}:${name}`;
            this.variableAddresses.set(key, address);
            this.variableMetadata.set(key, {
                type: type, // e.g. "int", "char*"
                isPointer: isPointer,
                size: size, // Total size for this simple var
                address: address,
                scope: scope,
                name: name
            });
            
            if (isPointer) {
                this.memory.set(address, 0); // Pointers are initialized to 0 (NULL) by default
                this.pointers.set(address, null); 
                if (initialValueForSimpleType !== null && initialValueForSimpleType !== undefined) {
                     this.memory.set(address, this.parseValue(initialValueForSimpleType));
                }
            } else {
                this.memory.set(address, (initialValueForSimpleType !== null && initialValueForSimpleType !== undefined) 
                                          ? this.parseValue(initialValueForSimpleType) 
                                          : this.getDefaultValueForType(type));
            }
            return address;
        } else {
            console.error(`Invalid type information passed to declareVariable for '${name}':`, typeOrElementType);
            return undefined;
        }
    }

    /**
     * Obtém metadados de uma variável (incluindo tipo, tamanho, etc.)
     * @param {string} name - Nome da variável
     * @param {string} scope - Escopo da variável
     * @returns {object | undefined} Objeto com metadados ou undefined se não encontrada
     */
    getVariableInfo(name, scope = 'global') {
        const key = `${scope}:${name}`;
        let info = this.variableMetadata.get(key);

        if (info === undefined && scope !== 'global') {
            // If not found in current scope, try global
            const globalKey = `global:${name}`;
            info = this.variableMetadata.get(globalKey);
        }
        // TODO: Consider deeper scope searching for function parameters if necessary,
        // similar to getVariable, but for now, current and global is a good start.
        return info;
    }

    /**
     * Atualiza o valor de uma variável
     * @param {string} name - Nome da variável
     * @param {*} value - Novo valor
     * @param {string} scope - Escopo da variável
     * @returns {boolean} Se a operação foi bem sucedida
     */
    setVariable(name, value, scope = 'global') {
        const key = `${scope}:${name}`;
        const address = this.variableAddresses.get(key);
        
        if (address === undefined) {
            return false;
        }
        
        // Se for um endereço (operador &)
        if (typeof value === 'string' && value.startsWith('&')) {
            const targetVarName = value.substring(1);
            const targetKey = `${scope}:${targetVarName}`;
            const targetAddress = this.variableAddresses.get(targetKey);
            
            if (targetAddress !== undefined) {
                this.memory.set(address, targetAddress);
                this.pointers.set(address, targetAddress);
                return true;
            }
            return false;
        }
        
        // Para valores normais
        this.memory.set(address, this.parseValue(value));
        return true;
    }

    /**
     * Obtém o valor de uma variável
     * @param {string} name - Nome da variável
     * @param {string} scope - Escopo da variável
     * @returns {*} Valor da variável
     */
    getVariable(name, scope = 'global') {
        // Procura primeiro no escopo atual
        let key = `${scope}:${name}`;
        let address = this.variableAddresses.get(key);
        
        if (address === undefined && scope !== 'global') {
            // Se não encontrar no escopo atual, procura no global
            key = `global:${name}`;
            address = this.variableAddresses.get(key);
            
            // Se ainda não encontrar e estiver numa função, procura no escopo do chamador
            if (address === undefined && this.stackFrames.length > 0) {
                const currentFrame = this.getCurrentFrame();
                if (currentFrame && currentFrame.caller) {
                    // Tenta o escopo do chamador
                    return this.getVariable(name, currentFrame.caller);
                }
            }
        }
        
        if (address === undefined) {
            return undefined;
        }
        
        return this.memory.get(address);
    }

    /**
     * Obtém o endereço de uma variável
     * @param {string} name - Nome da variável
     * @param {string} scope - Escopo da variável
     * @returns {number} Endereço da variável
     */
    getVariableAddress(name, scope = 'global') {
        const key = `${scope}:${name}`;
        return this.variableAddresses.get(key);
    }

    /**
     * Inicia um novo frame na pilha (para chamada de função)
     * @param {string} functionName - Nome da função chamada
     * @param {Object} parameters - Parâmetros da função
     * @param {string} callerFunction - Nome da função que fez a chamada
     * @returns {number} ID do frame na pilha
     */
    pushStackFrame(functionName, parameters = {}, callerFunction = null) {
        const frameId = this.stackFrames.length;
        
        const frame = {
            id: frameId,
            function: functionName,
            caller: callerFunction,
            parameters: {},
            variables: new Map(),
            returnAddress: null,
            returnValue: null
        };
        
        // Aloca memória para os parâmetros
        for (const [name, value] of Object.entries(parameters)) {
            const address = this.allocate(4); // Assume 4 bytes para simplicidade
            this.memory.set(address, this.parseValue(value));
            frame.parameters[name] = address;
            this.variableAddresses.set(`${functionName}:${name}`, address);
        }
        
        this.stackFrames.push(frame);
        return frameId;
    }

    /**
     * Remove o frame atual da pilha
     * @returns {Object} Frame removido
     */
    popStackFrame() {
        if (this.stackFrames.length === 0) {
            return null;
        }
        
        const removedFrame = this.stackFrames.pop();
        
        // Armazena o valor de retorno para uso em expressões futuras
        if (removedFrame.returnValue !== null) {
            this.lastReturnValues[removedFrame.function] = removedFrame.returnValue;
        }
        
        // Se restar algum frame na pilha após remoção, esse é o novo frame atual
        if (this.stackFrames.length > 0) {
            const currentFrame = this.stackFrames[this.stackFrames.length - 1];
        }
        
        return removedFrame;
    }

    /**
     * Obtém o frame atual da pilha
     * @returns {Object} Frame atual ou null se a pilha estiver vazia
     */
    getCurrentFrame() {
        if (this.stackFrames.length === 0) {
            return null;
        }
        
        return this.stackFrames[this.stackFrames.length - 1];
    }

    /**
     * Define o valor de retorno para o frame atual
     * @param {*} value - Valor de retorno
     */
    setReturnValue(value) {
        const currentFrame = this.getCurrentFrame();
        if (currentFrame) {
            currentFrame.returnValue = this.parseValue(value);
        }
    }

    /**
     * Obtém uma representação da memória para visualização
     * @returns {Array} Array de objetos com informações da memória
     */
    getMemorySnapshot() {
        const snapshot = [];
        
        // Iterate over variableMetadata which contains richer info
        for (const [key, meta] of this.variableMetadata.entries()) {
            if (meta.type === 'array') {
                const { name, scope, address: baseAddress, elementType, elementSize, arraySize } = meta;
                for (let i = 0; i < arraySize; i++) {
                    const elementAddress = baseAddress + (i * elementSize);
                    const value = this.memory.get(elementAddress);
                    const isElementPointer = elementType.includes('*');
                    let pointsToValue = null;
                    if (isElementPointer && this.pointers.has(elementAddress)) {
                        const targetAddr = this.pointers.get(elementAddress);
                        if (targetAddr !== null && targetAddr !== undefined) {
                           pointsToValue = `0x${targetAddr.toString(16).toUpperCase()}`;
                        }
                    }

                    snapshot.push({
                        address: `0x${elementAddress.toString(16).toUpperCase()}`,
                        name: `${name}[${i}]`,
                        scope: scope,
                        value: value,
                        isPointer: isElementPointer,
                        pointsTo: pointsToValue,
                        isArrayElement: true,
                        arrayName: name, // For grouping
                        elementIndex: i
                    });
                }
            } else {
                // Simple variable or pointer
                const { name, scope, address, type, isPointer: varIsPointer } = meta;
                const value = this.memory.get(address);
                let pointsToValue = null;
                if (varIsPointer && this.pointers.has(address)) {
                     const targetAddr = this.pointers.get(address);
                     if (targetAddr !== null && targetAddr !== undefined) {
                        pointsToValue = `0x${targetAddr.toString(16).toUpperCase()}`;
                     }
                }

                snapshot.push({
                    address: `0x${address.toString(16).toUpperCase()}`,
                    name: name,
                    scope: scope,
                    value: value,
                    isPointer: varIsPointer, // from metadata
                    pointsTo: pointsToValue,
                    isArrayElement: false
                });
            }
        }
        // Sort by scope and then by address (or name for stable order)
        snapshot.sort((a, b) => {
            if (a.scope < b.scope) return -1;
            if (a.scope > b.scope) return 1;
            // For arrays, sort by index within the same array
            if (a.isArrayElement && b.isArrayElement && a.arrayName === b.arrayName) {
                return a.elementIndex - b.elementIndex;
            }
            // If different types or not same array, sort by address
            return parseInt(a.address, 16) - parseInt(b.address, 16);
        });
        return snapshot;
    }

    /**
     * Obtém uma representação da pilha para visualização
     * @returns {Array} Array de objetos com informações da pilha
     */
    getStackSnapshot() {
        return this.stackFrames.map(frame => {
            const variables = {};
            
            // Inclui parâmetros no snapshot
            for (const [name, address] of Object.entries(frame.parameters)) {
                variables[name] = {
                    address: `0x${address.toString(16).toUpperCase()}`,
                    value: this.memory.get(address)
                };
            }
            
            // Inclui variáveis locais
            for (const [name, address] of frame.variables.entries()) {
                variables[name] = {
                    address: `0x${address.toString(16).toUpperCase()}`,
                    value: this.memory.get(address)
                };
            }
            
            return {
                function: frame.function,
                id: frame.id,
                caller: frame.caller, // Inclui informação sobre quem chamou esta função
                variables,
                returnValue: frame.returnValue
            };
        });
    }

    /**
     * Reseta o estado da memória
     */
    reset() {
        this.memory.clear();
        this.pointers.clear();
        this.variableAddresses.clear();
        this.variableMetadata.clear();
        this.stackFrames = [];
        this.nextAddress = 0x1000;
        this.lastReturnValues = {};
    }

    // Métodos auxiliares

    /**
     * Retorna o tamanho em bytes para um tipo
     * @param {string} type - Tipo da variável
     * @returns {number} Tamanho em bytes
     */
    getSizeForType(type) {
        if (type.includes('char')) return 1;
        if (type.includes('short')) return 2;
        if (type.includes('int') || type.includes('float') || type.includes('*')) return 4;
        if (type.includes('double') || type.includes('long')) return 8;
        return 4; // Padrão
    }

    /**
     * Retorna o valor padrão para um tipo
     * @param {string} type - Tipo da variável
     * @returns {*} Valor padrão
     */
    getDefaultValueForType(type) {
        if (type.includes('char')) return 0;
        if (type.includes('int') || type.includes('short') || type.includes('long')) return 0;
        if (type.includes('float') || type.includes('double')) return 0.0;
        if (type.includes('*')) return 0; // NULL
        return 0;
    }

    /**
     * Tenta converter um valor string para um tipo apropriado
     * @param {string} value - Valor a ser convertido
     * @returns {*} Valor convertido
     */
    parseValue(value) {
        if (value === null || value === undefined) return 0;
        
        if (typeof value !== 'string') return value;
        
        value = value.trim();
        
        // Verifica se é uma operação de endereço
        if (value.startsWith('&')) {
            return value; // Mantém como string para processamento posterior
        }
        
        // Verifica se é um número
        if (!isNaN(value)) {
            // Se tiver ponto decimal, é float
            if (value.includes('.')) {
                return parseFloat(value);
            }
            return parseInt(value, 10);
        }
        
        // Verifica se é um caractere (char)
        if (value.startsWith("'") && value.endsWith("'") && value.length === 3) {
            return value.charCodeAt(1);
        }
        
        // Mantém como string
        return value;
    }
}

// Exporta a classe
window.Memory = Memory;