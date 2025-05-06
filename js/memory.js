/**
 * Módulo de gerenciamento de memória para o simulador C99
 * Este arquivo contém a implementação da memória virtual e suas operações
 */

class Memory {
    constructor() {
        this.memory = new Map(); // Memória principal (endereço -> valor)
        this.pointers = new Map(); // Mapeia ponteiros para seus endereços referenciados
        this.variableAddresses = new Map(); // Mapeia nomes de variáveis para seus endereços
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
     * @returns {number} Endereço da variável
     */
    declareVariable(name, type, initialValue = null, scope = 'global') {
        const isPointer = type.includes('*');
        const size = this.getSizeForType(type);
        const address = this.allocate(size);
        
        // Cria uma chave única para a variável baseada no escopo
        const key = `${scope}:${name}`;
        
        this.variableAddresses.set(key, address);
        
        // Se é um ponteiro, inicializa com valor NULL (0) por padrão
        if (isPointer) {
            this.memory.set(address, 0);
            this.pointers.set(address, null); // Inicialmente não aponta para nada
        } else {
            // Para outros tipos, inicializa com o valor fornecido ou um padrão
            this.memory.set(address, initialValue !== null ? this.parseValue(initialValue) : this.getDefaultValueForType(type));
        }
        
        return address;
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
        
        // Para cada variável na memória
        for (const [key, address] of this.variableAddresses.entries()) {
            const [scope, name] = key.split(':');
            const value = this.memory.get(address);
            const isPointer = this.pointers.has(address);
            const pointsTo = isPointer ? this.pointers.get(address) : null;
            
            snapshot.push({
                address: `0x${address.toString(16).toUpperCase()}`,
                name,
                scope,
                value,
                isPointer,
                pointsTo: pointsTo !== null ? `0x${pointsTo.toString(16).toUpperCase()}` : null
            });
        }
        
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