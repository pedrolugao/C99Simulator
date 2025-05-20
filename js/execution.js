/**
 * Módulo de execução para o simulador C99
 * Este arquivo contém a lógica para executar o código C99 analisado
 */

class CExecutor {
    constructor() {
        this.parser = new CParser();
        this.memory = new Memory();
        this.output = [];
        this.ast = null;
        this.currentFunction = null;
        this.currentStatement = null;
        this.executionStack = [];
        this.executionPointer = 0;
        this.isRunning = false;
        this.isPaused = false;
        this.completedFrames = []; // Armazenará os frames que foram finalizados
    }

    /**
     * Inicializa o executor com um código C
     * @param {string} code - Código C99 a ser executado
     */
    initialize(code) {
        this.reset();
        this.ast = this.parser.parse(code);
        this.prepareExecution();
    }

    /**
     * Prepara a execução do código
     */
    prepareExecution() {
        if (!this.ast) return;

        // Encontra a função main
        const mainFunction = this.ast.functions.find(func => func.name === 'main');
        if (!mainFunction) {
            this.output.push('Erro: Função main não encontrada');
            return;
        }

        // Inicializa a pilha de execução com as instruções da main
        this.executionStack = [];
        this.flattenInstructions('main', mainFunction.body);
        
        // Inicializa um frame na pilha para main
        this.memory.pushStackFrame('main', {});
        
        this.executionPointer = 0;
        this.isRunning = true;
        this.isPaused = false;
    }

    /**
     * Aplana as instruções para facilitar a execução passo a passo
     * @param {string} functionName - Nome da função atual
     * @param {Array} instructions - Instruções a serem aplanadas
     */
    flattenInstructions(functionName, instructions) {
        for (const instruction of instructions) {
            // Adiciona instrução à pilha de execução
            this.executionStack.push({
                function: functionName,
                instruction,
                visited: false
            });
            
            // Se for uma instrução condicional, aplana os blocos
            if (instruction.type === 'if') {
                // Adiciona marcador de início do bloco if
                this.executionStack.push({
                    function: functionName,
                    instruction: { type: 'if_condition', condition: instruction.condition },
                    visited: false
                });
                
                // Aplana o bloco then
                this.flattenInstructions(functionName, instruction.then);
                
                // Adiciona marcador de fim do bloco if
                this.executionStack.push({
                    function: functionName,
                    instruction: { type: 'if_end' },
                    visited: false
                });
                
                // Se tiver bloco else, aplana também
                if (instruction.else) {
                    this.executionStack.push({
                        function: functionName,
                        instruction: { type: 'else_start' },
                        visited: false
                    });
                    
                    this.flattenInstructions(functionName, instruction.else);
                    
                    this.executionStack.push({
                        function: functionName,
                        instruction: { type: 'else_end' },
                        visited: false
                    });
                }
            } else if (instruction.type === 'while_loop') {
                const conditionCheckMarkerIndex = this.executionStack.length;
                this.executionStack.push({
                    function: functionName,
                    instruction: {
                        type: 'while_condition_check',
                        condition: instruction.condition,
                        loopBodyStartIndex: conditionCheckMarkerIndex + 1, // Instruction after this marker
                        loopEndMarkerIndex: -1, // Placeholder, will be updated later
                        originalInstruction: instruction // For line highlighting
                    },
                    visited: false
                });

                // Flatten the loop body
                this.flattenInstructions(functionName, instruction.body);

                // Now we know where the loop body ends and the 'while_loop_end' marker will be placed
                const loopEndMarkerActualIndex = this.executionStack.length;
                
                // Update the placeholder in the 'while_condition_check' marker
                if (conditionCheckMarkerIndex < this.executionStack.length) { // Ensure marker is still there
                   this.executionStack[conditionCheckMarkerIndex].instruction.loopEndMarkerIndex = loopEndMarkerActualIndex;
                }

                this.executionStack.push({
                    function: functionName,
                    instruction: {
                        type: 'while_loop_end',
                        conditionCheckMarkerIndex: conditionCheckMarkerIndex,
                        originalInstruction: instruction // For line highlighting
                    },
                    visited: false
                });
            } else if (instruction.type === 'for_loop') {
                // 1. Flatten Initialization Statement (if any)
                if (instruction.initialization && instruction.initialization.trim() !== '') {
                    // The parser stores init, cond, incr as strings.
                    // We need to parse the init string into AST statement(s).
                    // parseBody expects a block of statements, so add a semicolon if not present.
                    let initString = instruction.initialization;
                    if (!initString.endsWith(';')) {
                        initString += ';';
                    }
                    const initAstStatements = this.parser.parseBody(initString);
                    if (initAstStatements && initAstStatements.length > 0) {
                        // Flatten these initialization statements. They will be executed once.
                        this.flattenInstructions(functionName, initAstStatements);
                    }
                }

                // 2. Condition Check Marker
                const conditionCheckMarkerIndex = this.executionStack.length;
                this.executionStack.push({
                    function: functionName,
                    instruction: {
                        type: 'for_condition_check',
                        condition: instruction.condition, // Condition string
                        incrementStatementString: instruction.increment, // Increment string
                        // loopBodyStartIndex is implicitly conditionCheckMarkerIndex + 1
                        loopEndMarkerIndex: -1, // Placeholder, updated later
                        originalAstNode: instruction // For line highlighting
                    },
                    visited: false
                });

                // 3. Flatten Loop Body
                this.flattenInstructions(functionName, instruction.body);

                // 4. Increment Execution Marker
                this.executionStack.push({
                    function: functionName,
                    instruction: {
                        type: 'for_increment_execute',
                        incrementStatementString: instruction.increment,
                        originalAstNode: instruction // Highlight the for loop line during increment
                    },
                    visited: false
                });
                
                // 5. Loop End Marker and Update Placeholder
                const loopEndMarkerActualIndex = this.executionStack.length;
                // Update placeholder in 'for_condition_check' marker
                if(conditionCheckMarkerIndex < this.executionStack.length) { // Should always be true
                    this.executionStack[conditionCheckMarkerIndex].instruction.loopEndMarkerIndex = loopEndMarkerActualIndex;
                }

                this.executionStack.push({
                    function: functionName,
                    instruction: {
                        type: 'for_loop_end',
                        conditionCheckMarkerIndex: conditionCheckMarkerIndex,
                        originalAstNode: instruction // For line highlighting
                    },
                    visited: false
                });
            }
        }
    }

    /**
     * Executa o próximo passo da execução
     * @returns {Object} Informações sobre o estado atual da execução
     */
    step() {
        if (!this.isRunning || this.isPaused) {
            return { done: true };
        }
        
        if (this.executionPointer >= this.executionStack.length) {
            this.isRunning = false;
            return { done: true };
        }
        
        const currentExecution = this.executionStack[this.executionPointer];
        currentExecution.visited = true;
        
        this.currentFunction = currentExecution.function;
        this.currentStatement = currentExecution.instruction;
        
        // Executa a instrução atual
        this.executeInstruction(currentExecution);
        
        this.executionPointer++;
        
        return {
            done: !this.isRunning,
            function: this.currentFunction,
            statement: this.currentStatement,
            memory: this.memory.getMemorySnapshot(),
            stack: this.memory.getStackSnapshot(),
            output: [...this.output],
            completedFrames: [...this.completedFrames] // Inclui os frames finalizados
        };
    }

    /**
     * Executa todas as instruções até o final
     * @returns {Object} Informações sobre o estado final da execução
     */
    run() {
        let result;
        while (this.isRunning && !this.isPaused) {
            result = this.step();
        }
        return result;
    }

    /**
     * Pausa a execução
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * Continua a execução
     */
    resume() {
        this.isPaused = false;
    }

    /**
     * Reseta o estado do executor
     */
    reset() {
        this.memory.reset();
        this.output = [];
        this.ast = null;
        this.currentFunction = null;
        this.currentStatement = null;
        this.executionStack = [];
        this.executionPointer = 0;
        this.isRunning = false;
        this.isPaused = false;
        this.completedFrames = []; // Limpa os frames finalizados
    }

    /**
     * Executa uma instrução específica
     * @param {Object} execution - Objeto com informações da execução atual
     */
    executeInstruction(execution) {
        const instruction = execution.instruction;
        const functionName = execution.function;
        
        switch (instruction.type) {
            case 'variable_declaration':
                this.executeVariableDeclaration(instruction, functionName);
                break;
                
            case 'assignment':
                this.executeAssignment(instruction, functionName);
                break;
                
            case 'function_call':
                this.executeFunctionCall(instruction, functionName);
                break;
                
            case 'return':
                this.executeReturn(instruction, functionName);
                break;
                
            case 'if_condition':
                this.executeIfCondition(instruction, functionName);
                break;
                
            case 'if_end':
            case 'else_start':
            case 'else_end':
                // Instruções de controle, não fazem nada diretamente
                break;

            case 'while_condition_check':
                this.executeWhileConditionCheck(instruction, functionName);
                break;

            case 'while_loop_end':
                this.executeWhileLoopEnd(instruction, functionName);
                break;

            case 'for_condition_check':
                this.executeForConditionCheck(instruction, functionName);
                break;

            case 'for_increment_execute':
                this.executeForIncrement(instruction, functionName);
                break;

            case 'for_loop_end':
                this.executeForLoopEnd(instruction, functionName);
                break;
                
            case 'function_end':
                // Marca explicitamente a transição de volta para a função chamadora
                this.currentFunction = instruction.returnTo;
                break;
                
            default:
                this.output.push(`Aviso: Instrução não suportada: ${instruction.type}`);
        }
    }

    /**
     * Executa uma declaração de variável
     * @param {Object} instruction - Instrução a ser executada
     * @param {string} functionName - Nome da função atual
     */
    executeVariableDeclaration(instruction, functionName) {
        const { name, varType, initialValue, type } = instruction; // type is 'variable_declaration' or 'array_declaration'
        
        const scope = functionName === 'global' ? 'global' : functionName;
        let address;

        if (instruction.type === 'array_declaration') { // AST node for array
            // Pass the whole instruction object which matches the array AST node structure
            address = this.memory.declareVariable(name, instruction, null, scope);
        } else { // Simple variable
            address = this.memory.declareVariable(name, varType, initialValue, scope);
        }
                
        if (scope !== 'global' && address !== undefined) {
            const currentFrame = this.memory.getCurrentFrame();
            if (currentFrame) {
                currentFrame.variables.set(name, address);
            }
        }
        
        // Avalia o valor inicial se for uma expressão
        if (initialValue && !this.isLiteral(initialValue)) {
            const value = this.evaluateExpression(initialValue, scope);
            this.memory.setVariable(name, value, scope);
        }
    }

    /**
     * Executa uma atribuição
     * @param {Object} instruction - Instrução a ser executada
     * @param {string} functionName - Nome da função atual
     */
    executeAssignment(instruction, functionName) {
        const { name, value } = instruction; // 'name' can be a string or an array_access object
        const scope = functionName === 'global' ? 'global' : functionName;
        
        const evaluatedRhsValue = this.evaluateExpression(value, scope);

        if (typeof name === 'object' && name.type === 'array_access') {
            const arrayName = name.name;
            const indexExpression = name.indexExpression;

            const arrayInfo = this.memory.getVariableInfo(arrayName, scope);
            if (!arrayInfo || arrayInfo.type !== 'array') {
                this.output.push(`Erro: '${arrayName}' não é um array ou não foi declarado no escopo '${scope}'.`);
                console.error(`Erro: '${arrayName}' não é um array ou não foi declarado. arrayInfo:`, arrayInfo);
                this.isRunning = false;
                return;
            }

            const indexValue = this.evaluateExpression(indexExpression, scope);
            if (typeof indexValue !== 'number' || indexValue < 0 || indexValue >= arrayInfo.arraySize) {
                this.output.push(`Erro: Índice do array [${indexValue}] fora dos limites para '${arrayName}'. Tamanho: ${arrayInfo.arraySize}.`);
                console.error(`Erro: Índice do array [${indexValue}] fora dos limites para '${arrayName}'. Tamanho: ${arrayInfo.arraySize}.`);
                this.isRunning = false; // Halt on out-of-bounds
                return;
            }

            const targetAddress = arrayInfo.address + (indexValue * arrayInfo.elementSize);
            this.memory.memory.set(targetAddress, evaluatedRhsValue);

        } else if (typeof name === 'string') {
            // Simple variable assignment
            // Check if RHS is an address-of operation, should be handled by evaluateExpression or setVariable
            let valueToSet = evaluatedRhsValue;
            if (typeof value === 'string' && value.startsWith('&')) { // Re-check original RHS for '&'
                 valueToSet = this.evaluateExpression(value, scope); // Let evaluateExpression handle '&'
            }
            this.memory.setVariable(name, valueToSet, scope);
        } else {
            this.output.push(`Erro: Lado esquerdo inválido na atribuição: ${JSON.stringify(name)}`);
            this.isRunning = false;
        }
    }

    /**
     * Executa uma chamada de função
     * @param {Object} instruction - Instrução a ser executada
     * @param {string} callerFunction - Nome da função que está fazendo a chamada
     */
    executeFunctionCall(instruction, callerFunction) {
        const { name, arguments: args } = instruction;
        
        // Caso especial para printf (função da biblioteca padrão)
        if (name === 'printf') {
            this.executePrintf(args, callerFunction);
            return;
        }
        
        // Procura a função no AST
        const functionDef = this.ast.functions.find(f => f.name === name);
        if (!functionDef) {
            this.output.push(`Erro: Função '${name}' não definida`);
            return;
        }
        
        // Prepara os parâmetros para a chamada
        const params = {};
        for (let i = 0; i < functionDef.parameters.length && i < args.length; i++) {
            const paramName = functionDef.parameters[i].name;
            let argValue = args[i];
            
            // Avalia o argumento se não for literal
            if (argValue && !this.isLiteral(argValue)) {
                argValue = this.evaluateExpression(argValue, callerFunction);
            }
            
            params[paramName] = argValue;
        }
        
        // Cria um novo frame na pilha para a função chamada
        const frameId = this.memory.pushStackFrame(name, params, callerFunction);
        
        // Adiciona as instruções da função à pilha de execução
        const insertPoint = this.executionPointer + 1;
        
        // Cria um marcador de retorno com referência à função chamadora
        this.executionStack.splice(insertPoint, 0, {
            function: name,
            instruction: { type: 'function_end', returnTo: callerFunction },
            visited: false
        });
        
        // Adiciona as instruções da função (em ordem reversa para que fiquem na ordem correta na pilha)
        for (let i = functionDef.body.length - 1; i >= 0; i--) {
            this.executionStack.splice(insertPoint, 0, {
                function: name,
                instruction: functionDef.body[i],
                visited: false
            });
        }
    }

    /**
     * Executa um retorno de função
     * @param {Object} instruction - Instrução a ser executada
     * @param {string} functionName - Nome da função atual
     */
    executeReturn(instruction, functionName) {
        const { value, isRecursive, recursiveVar, recursiveFunc, recursiveArgs } = instruction;
        
        let returnValue;
        
        // Caso especial para retorno recursivo (fatorial e similares)
        if (isRecursive) {
            // Obtém o valor da variável (por exemplo, n em n * fatorial(n-1))
            const varValue = this.memory.getVariable(recursiveVar, functionName);
            
            // Se já temos um valor de retorno para a chamada recursiva, use-o
            if (recursiveFunc in this.memory.lastReturnValues) {
                const recursiveReturnValue = this.memory.lastReturnValues[recursiveFunc];
                returnValue = varValue * recursiveReturnValue;
            } else {
                // Se ainda não temos resultado da chamada recursiva, usa apenas o valor da variável
                returnValue = varValue;
            }
        } else {
            // Avalia o valor de retorno normal
            returnValue = value;
            if (value && !this.isLiteral(value)) {
                returnValue = this.evaluateExpression(value, functionName);
            }
        }
        
        // Define o valor de retorno no frame atual
        this.memory.setReturnValue(returnValue);
        
        // Armazena o valor de retorno para a função atual na memória
        this.memory.lastReturnValues[functionName] = returnValue;
        
        // Armazena uma cópia do frame atual antes de removê-lo da pilha
        const currentFrame = this.memory.getCurrentFrame();
        if (currentFrame) {
            // Adiciona à lista de frames completados para visualização
            this.completedFrames.push({...currentFrame, returnValue});
        }
        
        // Remove o frame atual da pilha
        this.memory.popStackFrame();
        
        // Se estiver retornando da main, finaliza a execução
        if (functionName === 'main') {
            this.isRunning = false;
            return;
        }
        
        // Busca o marcador de fim de função
        let endIndex = this.executionPointer;
        while (endIndex < this.executionStack.length) {
            const item = this.executionStack[endIndex];
            if (item.instruction.type === 'function_end' && item.function === functionName) {
                break;
            }
            endIndex++;
        }
        
        // Ajusta o ponteiro de execução para o fim da função
        if (endIndex < this.executionStack.length) {
            this.executionPointer = endIndex;
        }
    }

    /**
     * Executa uma condição if
     * @param {Object} instruction - Instrução a ser executada
     * @param {string} functionName - Nome da função atual
     */
    executeIfCondition(instruction, functionName) {
        const { condition } = instruction;
        
        // Avalia a condição
        const result = this.evaluateExpression(condition, functionName);
        
        // Se a condição for falsa, pula para o else ou para o fim do if
        if (!result) {
            // Procura o próximo else_start ou if_end
            let skipTo = this.executionPointer;
            let depth = 0;
            
            while (skipTo < this.executionStack.length) {
                skipTo++;
                const item = this.executionStack[skipTo];
                
                if (!item) break;
                
                // Controla a profundidade de ifs aninhados
                if (item.instruction.type === 'if_condition') {
                    depth++;
                } else if (item.instruction.type === 'if_end') {
                    if (depth === 0) {
                        break;
                    }
                    depth--;
                } else if (item.instruction.type === 'else_start' && depth === 0) {
                    break;
                }
            }
            
            if (skipTo < this.executionStack.length) {
                this.executionPointer = skipTo;
            }
        }
    }

    /**
     * Executa uma chamada para printf (simulação simplificada)
     * @param {Array} args - Argumentos para printf
     * @param {string} functionName - Nome da função chamadora
     */
    executePrintf(args, functionName) {
        if (args.length === 0) {
            this.output.push('');
            return;
        }
        
        // Obtém a string de formato
        let format = args[0];
        // Remove aspas duplas
        if (format.startsWith('"') && format.endsWith('"')) {
            format = format.substring(1, format.length - 1);
        }
        
        // Substitui especificadores de formato por valores reais
        let outputStr = format;
        let argIndex = 1;
        
        // Substitui %d, %f, etc.
        outputStr = outputStr.replace(/%[diouxXfFeEgGaAcs]/g, (match) => {
            if (argIndex < args.length) {
                const arg = args[argIndex++];
                return this.evaluateExpression(arg, functionName);
            }
            return match;
        });
        
        this.output.push(outputStr);
    }

    /**
     * Avalia uma expressão no contexto atual
     * @param {string} expression - Expressão a ser avaliada
     * @param {string} scope - Escopo atual
     * @returns {*} Resultado da expressão
     */
    evaluateExpression(expression, scope) {
        // Verifica se é um operador de endereço
        if (typeof expression === 'string' && expression.startsWith('&')) {
            return expression;
        }
        
        // Converte para string se não for
        if (typeof expression !== 'string') {
            return expression;
        }
        
        expression = expression.trim();
        
        // Processa expressões com chamada de função recursiva
        // Exemplo: n * fatorial(n-1) ou n * factorial(n-1)
        const recursivePattern = /(\w+)\s*\*\s*(\w+)\(([^)]+)\)/;
        const recursiveMatch = expression.match(recursivePattern);
        
        if (recursiveMatch) {
            const varName = recursiveMatch[1]; // n
            const funcName = recursiveMatch[2]; // fatorial
            const argExpr = recursiveMatch[3]; // n-1
            
            // Este é um caso especial para expressões recursivas como fatorial
            // Obtém o valor da variável (n neste caso)
            const varValue = this.memory.getVariable(varName, scope);
            
            // Obtém o valor do último retorno desta função (se disponível)
            let returnValue = 0;
            if (funcName in this.memory.lastReturnValues) {
                returnValue = this.memory.lastReturnValues[funcName];
                
                // Retorna o cálculo completo: n * (valor retornado pela chamada recursiva)
                return varValue * returnValue;
            }
            
            // Se ainda não temos um valor de retorno, um cálculo preciso não é possível
            // Então apenas avalia um lado da expressão
            return varValue;
        }
        
        // Chamada de função simples
        const functionCallMatch = expression.match(/(\w+)\s*\((.*)\)/);
        if (functionCallMatch) {
            const functionName = functionCallMatch[1];
            const argsStr = functionCallMatch[2];
            
            // Se já tivermos um valor de retorno para esta função, use-o
            if (functionName in this.memory.lastReturnValues) {
                return this.memory.lastReturnValues[functionName];
            }
            
            return 0; // Valor padrão se não conhecemos o resultado
        }
        
        // Operações matemáticas básicas
        const tokens = this.parser.parseExpression(expression); // Now returns a list of tokens/objects

        // This is a placeholder for a more robust expression evaluation (e.g., Shunting-yard)
        // For now, we'll handle simple cases and array access as a primary value.
        if (tokens.length === 1) {
            return this.getExpressionValue(tokens[0], scope);
        }

        if (tokens.length === 3) {
            const left = this.getExpressionValue(tokens[0], scope);
            const operator = tokens[1]; // Should be a string
            const right = this.getExpressionValue(tokens[2], scope);
            
            // Ensure left and right are numbers for arithmetic operations
            // This is a simplification; type checking should be more robust.
            const numLeft = Number(left);
            const numRight = Number(right);

            if (isNaN(numLeft) || isNaN(numRight)) {
                 // Handle specific non-arithmetic cases like string ops or logical ops if any
                 if (operator === '&&') return (left && right) ? 1 : 0;
                 if (operator === '||') return (left || right) ? 1 : 0;
                 // Potentially handle string concatenation if '+' is overloaded, though C doesn't do that for strings.
                 // For now, if not arithmetic, and not logical, it's an error or unhandled op
                 this.output.push(`Erro: Operação '${operator}' com operandos não numéricos: ${left}, ${right}`);
                 this.isRunning = false;
                 return undefined;
            }

            switch (operator) {
                case '+': return numLeft + numRight;
                case '-': return numLeft - numRight;
                case '*': return numLeft * numRight;
                case '/': 
                    if (numRight === 0) {
                        this.output.push("Erro: Divisão por zero.");
                        this.isRunning = false;
                        return undefined;
                    }
                    return Math.floor(numLeft / numRight); // Divisão inteira em C
                case '%': 
                    if (numRight === 0) {
                        this.output.push("Erro: Modulo por zero.");
                        this.isRunning = false;
                        return undefined;
                    }
                    return numLeft % numRight;
                case '<': return numLeft < numRight ? 1 : 0;
                case '>': return numLeft > numRight ? 1 : 0;
                case '<=': return numLeft <= numRight ? 1 : 0;
                case '>=': return numLeft >= numRight ? 1 : 0;
                case '==': return left === right ? 1 : 0; // Use original left/right for potential type diffs if not strictly numbers
                case '!=': return left !== right ? 1 : 0;
                case '&&': return (numLeft && numRight) ? 1 : 0; // Logical ops on numbers (0 is false, non-0 is true)
                case '||': return (numLeft || numRight) ? 1 : 0;
                default:
                     this.output.push(`Erro: Operador desconhecido '${operator}'`);
                     this.isRunning = false;
                     return undefined;
            }
        }
        
        // Fallback for single token or more complex expressions not handled by 3-part logic
        if (tokens.length > 0) {
             return this.getExpressionValue(tokens[0], scope); // Simplistic: evaluate first token only
        }
        this.output.push(`Erro: Expressão inválida ou muito complexa para avaliação simplificada: ${expression}`);
        this.isRunning = false;
        return undefined; // Should ideally throw or handle error
    }

    /**
     * Obtém o valor de uma parte da expressão (token individual)
     * @param {string | number | object} token - Parte da expressão (pode ser string, número ou objeto array_access)
     * @param {string} scope - Escopo atual
     * @returns {*} Valor da expressão
     */
    getExpressionValue(token, scope) {
        if (typeof token === 'number') {
            return token; // Already a literal number
        }
        if (typeof token === 'string') {
            token = token.trim();
            // Constantes numéricas (string form)
            if (!isNaN(token)) {
                return parseFloat(token);
            }
            // String literals (e.g. "text", though C strings are char arrays)
            if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
                // For now, returning string literals as is. Printf handles them.
                // In expressions, they'd typically be addresses of char arrays.
                return token;
            }
            // Simple variable name
            return this.memory.getVariable(token, scope) ?? 0; // Default to 0 if undefined
        }
        if (typeof token === 'object' && token.type === 'array_access') {
            const arrayName = token.name;
            const indexExpression = token.indexExpression; // This is a string

            const arrayInfo = this.memory.getVariableInfo(arrayName, scope);
            if (!arrayInfo || arrayInfo.type !== 'array') {
                this.output.push(`Erro: '${arrayName}' não é um array ou não foi declarado no escopo '${scope}'.`);
                console.error(`Erro: '${arrayName}' não é um array ou não foi declarado. arrayInfo:`, arrayInfo);
                this.isRunning = false;
                return undefined; // Halt
            }

            const indexValue = this.evaluateExpression(indexExpression, scope); // Recursive call for index
            if (typeof indexValue !== 'number' || indexValue < 0 || indexValue >= arrayInfo.arraySize) {
                this.output.push(`Erro: Índice do array [${indexValue}] fora dos limites para '${arrayName}'. Tamanho: ${arrayInfo.arraySize}.`);
                console.error(`Erro: Índice do array [${indexValue}] fora dos limites para '${arrayName}'. Tamanho: ${arrayInfo.arraySize}.`);
                this.isRunning = false; // Halt on out-of-bounds
                return undefined;
            }
            const elementAddress = arrayInfo.address + (indexValue * arrayInfo.elementSize);
            return this.memory.memory.get(elementAddress);
        }
        
        this.output.push(`Erro: Token de expressão desconhecido: ${JSON.stringify(token)}`);
        this.isRunning = false;
        return undefined; // Should throw or handle error
    }

    /**
     * Verifica se um valor é um literal (número, string, etc)
     * @param {string} value - Valor a verificar
     * @returns {boolean} Se é um literal
     */
    isLiteral(value) {
        if (typeof value !== 'string') {
            return true;
        }
        
        // Número
        if (!isNaN(value)) {
            return true;
        }
        
        // String entre aspas
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            return true;
        }
        
        return false;
    }

    /**
     * Obtém o estado atual da execução
     * @returns {Object} Estado atual
     */
    getExecutionState() {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            currentFunction: this.currentFunction,
            currentStatement: this.currentStatement,
            memory: this.memory.getMemorySnapshot(),
            stack: this.memory.getStackSnapshot(),
            output: [...this.output],
            completedFrames: [...this.completedFrames] // Inclui os frames finalizados
        };
    }
}

// Exporta a classe
window.CExecutor = CExecutor;