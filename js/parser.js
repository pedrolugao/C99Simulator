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
            // Declaração de variável
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
        // Se a expressão contiver uma chamada de função, preservamos como está
        if (expr.match(/\w+\s*\(/)) {
            return [expr];
        }
        
        // Uma abordagem simplificada: divide a expressão em tokens
        // Primeiro separamos operadores
        const operators = ['\\+', '-', '\\*', '/', '%', '<=', '>=', '==', '!=', '<', '>', '&&', '\\|\\|'];
        const operatorRegex = new RegExp(`(${operators.join('|')})`, 'g');
        
        // Substituímos operadores por espaço+operador+espaço para facilitar o split
        const normalized = expr.replace(operatorRegex, ' $1 ');
        
        // Dividimos por espaço e filtramos tokens vazios
        return normalized.split(/\s+/).filter(token => token);
    }
}

// Exporta o parser
window.CParser = CParser;