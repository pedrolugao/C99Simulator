/**
 * Parser para código C99
 * Este arquivo contém funcionalidades para analisar código C99 simples
 */

class CParser {
    constructor() {
        this.variables = new Map();
        this.functions = new Map();
        this.includes = [];
        this.currentScope = "global";
        this.ast = null;
    }

    /**
     * Analisa o código C e constrói uma AST simplificada
     * @param {string} code - Código C99 a ser analisado
     * @returns {Object} AST simplificada
     */
    parse(code) {
        // Remove comentários de linha única
        code = code.replace(/\/\/.*$/gm, '');
        
        // Remove comentários multi-linha
        code = code.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // Identifica includes
        const includeRegex = /#include\s*<([^>]+)>/g;
        let match;
        while ((match = includeRegex.exec(code)) !== null) {
            this.includes.push(match[1]);
        }
        
        // Divide o código em funções
        const functionRegex = /(\w+)\s+(\w+)\s*\(([^)]*)\)\s*{([^{}]*(?:{[^{}]*(?:{[^{}]*}[^{}]*)*}[^{}]*)*)}/g;
        const functions = [];
        
        while ((match = functionRegex.exec(code)) !== null) {
            const returnType = match[1];
            const functionName = match[2];
            const params = this.parseParameters(match[3]);
            const body = this.parseBody(match[4]);
            
            functions.push({
                type: 'function',
                returnType,
                name: functionName,
                parameters: params,
                body
            });
            
            this.functions.set(functionName, {
                returnType,
                parameters: params
            });
        }
        
        this.ast = {
            includes: this.includes,
            functions
        };
        
        return this.ast;
    }
    
    /**
     * Analisa os parâmetros de uma função
     * @param {string} paramsString - String com os parâmetros da função
     * @returns {Array} Array de objetos representando os parâmetros
     */
    parseParameters(paramsString) {
        if (!paramsString.trim()) return [];
        
        const params = paramsString.split(',').map(param => {
            const parts = param.trim().split(/\s+/);
            const name = parts.pop();
            const type = parts.join(' ');
            const isPointer = name.includes('*');
            
            return {
                type: type + (isPointer ? '*' : ''),
                name: name.replace('*', '')
            };
        });
        
        return params;
    }
    
    /**
     * Analisa o corpo de uma função e extrai as instruções
     * @param {string} bodyString - String com o corpo da função
     * @returns {Array} Array de objetos representando as instruções
     */
    parseBody(bodyString) {
        const body = [];
        
        // Dividimos o corpo em linhas e analisamos cada uma
        let lines = bodyString.split(';').map(line => line.trim()).filter(line => line);
        
        for (const line of lines) {
            // Array declaration parsing
            // int arr[10]; char name[20]; float values[SIZE]; int arr[] = {1,2,3}; char str[] = "hello";
            const arrayDeclRegex = /^(int|char|float|double)\s+(\w+)\s*\[\s*(\w*)\s*\](?:\s*=\s*(.+))?$/;
            const arrayMatch = arrayDeclRegex.exec(line);

            if (arrayMatch) {
                const varType = arrayMatch[1];
                const name = arrayMatch[2];
                const sizeFromDecl = arrayMatch[3]; // Can be empty, a number string, or a symbolic string
                const rawInitializer = arrayMatch[4];
                
                let finalSize = null;
                let initialValue = null;

                // Determine initial size based on declaration (e.g., "10" or "SIZE")
                if (sizeFromDecl) {
                    const num = parseInt(sizeFromDecl, 10);
                    if (!isNaN(num)) {
                        finalSize = num;
                    } else {
                        finalSize = sizeFromDecl; // Symbolic size like 'SIZE'
                    }
                } // If sizeFromDecl is empty, finalSize remains null for now.

                if (rawInitializer) {
                    if (rawInitializer.startsWith('{') && rawInitializer.endsWith('}')) {
                        // Initializer list: e.g., {1, 2, 3}
                        const listContent = rawInitializer.substring(1, rawInitializer.length - 1).trim();
                        if (listContent) {
                            initialValue = listContent.split(',').map(item => {
                                item = item.trim();
                                // Attempt to convert to number, otherwise keep as string (for potential symbols)
                                return isNaN(Number(item)) ? item : Number(item);
                            });
                        } else {
                            initialValue = []; // Empty initializer list e.g. {}
                        }
                        if (sizeFromDecl === '') { // Infer size: int arr[] = {1,2,3};
                            finalSize = initialValue.length;
                        }
                    } else if (varType === 'char' && rawInitializer.startsWith('"') && rawInitializer.endsWith('"')) {
                        // String literal for char array: e.g., "hello"
                        initialValue = rawInitializer; // Keep the quotes as per requirement "hello"
                        if (sizeFromDecl === '') { // Infer size: char str[] = "hello";
                            finalSize = rawInitializer.length - 2 + 1; // string content length + null terminator
                        }
                    } else {
                        // Other types of initializers (e.g., single value for non-char array, or complex expression)
                        // For now, store as is. This part might need more specific handling for non-char arrays if not an initializer list.
                        initialValue = rawInitializer;
                        // If it's a simple variable assigned to an array element (e.g. int x = arr[0]), this regex won't catch it.
                        // This path is more for `int arr[5] = x;` which is not standard C for full array init.
                        // However, the regex `(?:\s*=\s*(.+))?$` captures the RHS broadly.
                        // If sizeFromDecl was empty, finalSize would still be null here, which is an issue if type != char
                        // e.g. int arr[] = x; -> size remains null. This is complex.
                        // Let's assume for now that non-char arrays without explicit size must use {} or not be handled by this initializer block.
                        // The problem description focuses on {} and "" for initializers.
                    }
                }
                
                // finalSize can be: a number, a symbolic string, or null (if not specified and not inferable)
                const dimensions = finalSize !== null ? [finalSize] : [null];

                body.push({
                    type: 'array_declaration',
                    varType: varType,
                    name: name,
                    size: finalSize, 
                    dimensions: dimensions,
                    initialValue: initialValue
                });
                continue;
            }

            // Declaração de variável (simple)
            const varDeclRegex = /^(int|char|float|double)\s+(\*?)\s*(\w+)(?:\s*=\s*(.+))?$/;
            const varMatch = varDeclRegex.exec(line);
            
            if (varMatch) {
                const type = varMatch[1];
                const isPointer = varMatch[2] === '*';
                const name = varMatch[3];
                const initialValue = varMatch[4];
                
                body.push({
                    type: 'variable_declaration',
                    varType: type + (isPointer ? '*' : ''),
                    name,
                    initialValue
                });
                
                continue;
            }

            // Controle de fluxo - for loop
            // Regex captures: 1=initialization, 2=condition, 3=increment, 4=body
            const forRegex = /^for\s*\(([^;]*);([^;]*);([^)]*)\)\s*{([^{}]*(?:{[^{}]*(?:{[^{}]*}[^{}]*)*}[^{}]*)*)}$/;
            const forMatch = forRegex.exec(line);

            if (forMatch) {
                const initialization = forMatch[1].trim();
                const condition = forMatch[2].trim();
                const increment = forMatch[3].trim();
                const bodyContent = forMatch[4];
                const loopBody = this.parseBody(bodyContent); // Recursively parse the loop's body

                body.push({
                    type: 'for_loop',
                    initialization: initialization,
                    condition: condition,
                    increment: increment,
                    body: loopBody
                });
                continue;
            }
            
            // Controle de fluxo - while loop
            // Regex captures: 1=condition, 2=body
            const whileRegex = /^while\s*\((.+?)\)\s*{([^{}]*(?:{[^{}]*(?:{[^{}]*}[^{}]*)*}[^{}]*)*)}$/;
            const whileMatch = whileRegex.exec(line);

            if (whileMatch) {
                const condition = whileMatch[1].trim();
                const bodyContent = whileMatch[2];
                const loopBody = this.parseBody(bodyContent); // Recursively parse the loop's body

                body.push({
                    type: 'while_loop',
                    condition: condition,
                    body: loopBody
                });
                continue;
            }
            
            // Atribuição de variável
            const assignRegex = /^(\w+)\s*=\s*(.+)$/;
            const assignMatch = assignRegex.exec(line);
            
            if (assignMatch) {
                const name = assignMatch[1];
                const value = assignMatch[2];
                
                body.push({
                    type: 'assignment',
                    name,
                    value
                });
                
                continue;
            }
            
            // Chamada de função
            const funcCallRegex = /^(\w+)\((.*)\)$/;
            const funcMatch = funcCallRegex.exec(line);
            
            if (funcMatch) {
                const functionName = funcMatch[1];
                const argsStr = funcMatch[2].trim();
                const args = argsStr ? this.parseArgumentList(argsStr) : [];
                
                body.push({
                    type: 'function_call',
                    name: functionName,
                    arguments: args
                });
                
                continue;
            }
            
            // Retorno com padrão de recursão (n * fatorial(n-1))
            const recursiveReturnRegex = /^return\s+(\w+)\s*\*\s*(\w+)\s*\((.*)\)$/;
            const recursiveMatch = recursiveReturnRegex.exec(line);
            
            if (recursiveMatch) {
                const varName = recursiveMatch[1];
                const funcName = recursiveMatch[2];
                const argsStr = recursiveMatch[3].trim();
                
                // Criamos uma instrução de return específica para recursão
                body.push({
                    type: 'return',
                    value: `${varName} * ${funcName}(${argsStr})`,
                    isRecursive: true,
                    recursiveVar: varName,
                    recursiveFunc: funcName,
                    recursiveArgs: argsStr ? this.parseArgumentList(argsStr) : []
                });
                
                continue;
            }
            
            // Retorno normal
            const returnRegex = /^return\s+(.*)$/;
            const returnMatch = returnRegex.exec(line);
            
            if (returnMatch) {
                const value = returnMatch[1];
                
                body.push({
                    type: 'return',
                    value
                });
                
                continue;
            }
            
            // Controle de fluxo - condicional if
            const ifRegex = /^if\s*\((.*)\)\s*{(.*)}(?:\s*else\s*{(.*)})?\s*$/;
            const ifMatch = ifRegex.exec(line);
            
            if (ifMatch) {
                const condition = ifMatch[1];
                const thenBranch = this.parseBody(ifMatch[2]);
                const elseBranch = ifMatch[3] ? this.parseBody(ifMatch[3]) : null;
                
                body.push({
                    type: 'if',
                    condition,
                    then: thenBranch,
                    else: elseBranch
                });
                
                continue;
            }
            
            // Código não reconhecido
            body.push({
                type: 'unknown',
                code: line
            });
        }
        
        return body;
    }
    
    /**
     * Analisa uma lista de argumentos para uma chamada de função
     * @param {string} argStr - String com os argumentos separados por vírgula
     * @returns {Array} Lista de argumentos processados
     */
    parseArgumentList(argStr) {
        if (!argStr.trim()) return [];
        
        const args = [];
        let currentArg = '';
        let parenLevel = 0;
        
        // Parse manual para lidar com chamadas de função aninhadas nos argumentos
        for (let i = 0; i < argStr.length; i++) {
            const char = argStr[i];
            
            if (char === '(') {
                parenLevel++;
                currentArg += char;
            } else if (char === ')') {
                parenLevel--;
                currentArg += char;
            } else if (char === ',' && parenLevel === 0) {
                args.push(currentArg.trim());
                currentArg = '';
            } else {
                currentArg += char;
            }
        }
        
        if (currentArg.trim()) {
            args.push(currentArg.trim());
        }
        
        return args;
    }
    
    /**
     * Simplifica a análise de expressões
     * @param {string} expr - Expressão a ser analisada
     * @returns {Array} Tokens da expressão
     */
    parseExpression(expr) {
        const tokens = [];
        const arrayAccessRegex = /^(\w+)\s*\[([^\]]+)\]/;
        const identifierRegex = /^[a-zA-Z_]\w*/;
        const numberRegex = /^\d+\.?\d*|^\.\d+/;
        // Extended operators: includes parentheses, comma for function args if needed later
        const operatorRegex = /^(\*\*|\*|\/|%|\+|-|<=|>=|==|!=|<|>|&&|\|\||\(|\)|=|,)/; // Added '=' for general expressions, '(' ')'
        const stringLiteralRegex = /^"[^"]*"|^'[^']*'/;

        let remainingExpr = expr.trim();

        while (remainingExpr.length > 0) {
            let match;

            // 1. Array Access
            if ((match = arrayAccessRegex.exec(remainingExpr))) {
                tokens.push({
                    type: "array_access",
                    name: match[1],
                    indexExpression: match[2].trim() // Store the inner expression string
                });
                remainingExpr = remainingExpr.substring(match[0].length).trim();
            }
            // 2. String Literals
            else if ((match = stringLiteralRegex.exec(remainingExpr))) {
                tokens.push(match[0]); // Push the full string literal with quotes
                remainingExpr = remainingExpr.substring(match[0].length).trim();
            }
            // 3. Identifiers (must come after array access)
            else if ((match = identifierRegex.exec(remainingExpr))) {
                tokens.push(match[0]);
                remainingExpr = remainingExpr.substring(match[0].length).trim();
            }
            // 4. Numbers
            else if ((match = numberRegex.exec(remainingExpr))) {
                tokens.push(parseFloat(match[0])); // Store as number
                remainingExpr = remainingExpr.substring(match[0].length).trim();
            }
            // 5. Operators
            else if ((match = operatorRegex.exec(remainingExpr))) {
                tokens.push(match[0]);
                remainingExpr = remainingExpr.substring(match[0].length).trim();
            }
            // 6. Whitespace (if any remains, skip)
            else if (remainingExpr.match(/^\s+/)) {
                remainingExpr = remainingExpr.replace(/^\s+/, '');
            }
            // Error: unrecognized token
            else {
                // Store the problematic part as an 'unknown' token or throw error
                const unknownToken = remainingExpr.split(/\s|[(),;]/)[0] || remainingExpr;
                tokens.push({ type: 'unknown_expression_token', value: unknownToken });
                console.error(`CParser.parseExpression: Unrecognized token starting with: ${unknownToken} in expression ${expr}`);
                remainingExpr = remainingExpr.substring(unknownToken.length).trim();
            }
        }
        return tokens;
    }
}

// Exporta o parser
window.CParser = CParser;