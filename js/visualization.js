/**
 * Módulo de visualização para o simulador C99
 * Este arquivo contém funções para visualizar a memória, pilha e ponteiros
 */

class CVisualizer {
    constructor() {
        this.memoryContainer = document.getElementById('memory-view');
        this.stackContainer = document.getElementById('stack-view');
        this.outputContainer = document.getElementById('output');
        this.codeTextArea = document.getElementById('c-code');
        this.codeDisplay = document.getElementById('code-display');
        this.lineIndicator = document.getElementById('line-indicator');
        this.lineNumberElement = document.getElementById('current-line-number');
        this.lineContextElement = document.getElementById('current-line-context');
        this.pointerConnections = new Map();
        this.currentHighlight = null;
        this.currentLine = null;
        this.lineMap = new Map(); // Mapeia instruções para linhas no código
        this.completedFunctions = new Set(); // Armazena funções que já foram finalizadas
    }

    /**
     * Inicializa o mapeamento de instruções para linhas de código
     * @param {Object} ast - AST do código analisado
     * @param {string} code - Código fonte original
     */
    initializeLineMapping(ast, code) {
        this.lineMap.clear();
        
        // Mapeia todas as funções e suas instruções para linhas
        const lines = code.split('\n');
        
        // Mapeamento simplificado baseado em tokens-chave no código
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i;
            
            // Funções
            const functionMatch = line.match(/(\w+)\s+(\w+)\s*\(/);
            if (functionMatch) {
                this.lineMap.set(`function:${functionMatch[2]}`, lineNumber);
            }
            
            // Variáveis
            const varDeclMatch = line.match(/(int|char|float|double)\s+(\*?)(\w+)/);
            if (varDeclMatch) {
                this.lineMap.set(`variable:${varDeclMatch[3]}`, lineNumber);
            }
            
            // Atribuições
            const assignMatch = line.match(/(\w+)\s*=\s*(.+);/);
            if (assignMatch) {
                this.lineMap.set(`assignment:${assignMatch[1]}`, lineNumber);
            }
            
            // Chamadas de função
            const callMatch = line.match(/(\w+)\s*\((.*)\)/);
            if (callMatch) {
                this.lineMap.set(`call:${callMatch[1]}`, lineNumber);
            }
            
            // Retornos
            if (line.startsWith('return')) {
                this.lineMap.set(`return:${i}`, lineNumber);
            }
            
            // Condicionais
            if (line.startsWith('if') || line.startsWith('else')) {
                this.lineMap.set(`conditional:${i}`, lineNumber);
            }
        }
    }

    /**
     * Atualiza a visualização da memória
     * @param {Array} memorySnapshot - Snapshot do estado atual da memória
     * @param {Array} stackSnapshot - Snapshot do estado atual da pilha
     */
    updateMemoryView(memorySnapshot, stackSnapshot) {
        if (!this.memoryContainer) return;
        
        this.memoryContainer.innerHTML = '';
        this.pointerConnections.clear();
        
        // Organiza os itens por escopo
        const itemsByScope = {};
        
        for (const item of memorySnapshot) {
            if (!itemsByScope[item.scope]) {
                itemsByScope[item.scope] = [];
            }
            itemsByScope[item.scope].push(item);
        }
        
        // Verifica quais funções já completaram sua execução (não estão mais na pilha)
        const activeScopes = new Set(['global']);
        if (stackSnapshot) {
            for (const frame of stackSnapshot) {
                activeScopes.add(frame.function);
            }
        }
        
        // Para cada escopo, cria uma seção
        for (const [scope, items] of Object.entries(itemsByScope)) {
            // Cria cabeçalho do escopo
            const scopeHeader = document.createElement('div');
            scopeHeader.className = 'memory-scope-header';
            
            // Se a função não está mais na pilha e não é global, marca como completada
            if (!activeScopes.has(scope) && scope !== 'global') {
                scopeHeader.classList.add('scope-completed');
                this.completedFunctions.add(scope);
            }
            
            scopeHeader.textContent = `Escopo: ${scope}`;
            this.memoryContainer.appendChild(scopeHeader);
            
            // Cria um container para os itens deste escopo
            const scopeContainer = document.createElement('div');
            scopeContainer.className = 'memory-scope-container';
            
            // Se a função já foi completada, adiciona classe especial
            if (this.completedFunctions.has(scope)) {
                scopeContainer.classList.add('scope-completed');
            }
            
            // Adiciona cada item de memória
            // let previousItemArrayName = null; // Not needed due to sorting and direct check
            items.forEach((item, idx) => { // Added idx for checking previous item
                const memoryCell = document.createElement('div');
                memoryCell.className = 'memory-cell';
                memoryCell.dataset.address = item.address; // Crucial for pointer connections
                
                // Se o escopo da variável pertence a uma função completada, marca célula
                if (this.completedFunctions.has(item.scope)) {
                    memoryCell.classList.add('cell-completed');
                }

                // Add specific classes for array elements
                if (item.isArrayElement) {
                    memoryCell.classList.add('array-element');
                    if (item.arrayName) { // Ensure arrayName exists
                        memoryCell.classList.add(`array-owner-${item.arrayName}`);
                    }

                    // Check if this is the first element of its array group within this scope.
                    // Relies on the snapshot being sorted by scope, then arrayName, then elementIndex.
                    const isFirstInGroup = (idx === 0 || 
                                           !items[idx-1].isArrayElement || // Previous item was not an array element
                                           items[idx-1].arrayName !== item.arrayName); // Previous item belonged to a different array
                    
                    if (isFirstInGroup) {
                        memoryCell.classList.add('first-array-element');
                    }
                }
                
                // Endereço
                const addressElem = document.createElement('div');
                addressElem.className = 'memory-address';
                addressElem.textContent = `${item.address}:`;
                memoryCell.appendChild(addressElem);
                
                // Nome da variável
                const nameElem = document.createElement('div');
                nameElem.className = 'memory-name';
                nameElem.textContent = item.name;
                memoryCell.appendChild(nameElem);
                
                // Valor
                const valueElem = document.createElement('div');
                valueElem.className = 'memory-value';
                valueElem.textContent = item.value;
                memoryCell.appendChild(valueElem);
                
                // Se for um ponteiro, mostra para onde aponta
                if (item.isPointer && item.pointsTo) {
                    const arrowElem = document.createElement('div');
                    arrowElem.className = 'pointer-arrow';
                    arrowElem.textContent = ' → ';
                    memoryCell.appendChild(arrowElem);
                    
                    const targetElem = document.createElement('div');
                    targetElem.className = 'memory-target';
                    targetElem.textContent = item.pointsTo;
                    memoryCell.appendChild(targetElem);
                    
                    // Armazena a conexão para desenhar depois
                    this.pointerConnections.set(item.address, item.pointsTo);
                }
                
                scopeContainer.appendChild(memoryCell);
            });
            
            this.memoryContainer.appendChild(scopeContainer);
        }
        
        // Desenha as setas de conexão entre ponteiros
        this.drawPointerConnections();
    }

    /**
     * Atualiza a visualização da pilha
     * @param {Array} stackSnapshot - Snapshot do estado atual da pilha
     * @param {Array} completedFrames - Lista de frames que foram concluídos
     */
    updateStackView(stackSnapshot, completedFrames = []) {
        if (!this.stackContainer) return;
        
        this.stackContainer.innerHTML = '';
        
        if (stackSnapshot.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'stack-empty';
            emptyMsg.textContent = 'Pilha vazia';
            this.stackContainer.appendChild(emptyMsg);
            return;
        }
        
        // Container principal da pilha
        const stackVisual = document.createElement('div');
        stackVisual.className = 'stack-visual';
        
        // Conjunto de funções que não estão mais na pilha atual
        const currentFunctions = new Set(stackSnapshot.map(frame => frame.function));
        
        // Verifica se há funções que foram removidas da pilha
        for (const frame of completedFrames || []) {
            if (!currentFunctions.has(frame.function)) {
                this.completedFunctions.add(frame.function);
            }
        }
        
        // Constrói a pilha do fundo para o topo (invertido visualmente)
        for (let i = 0; i < stackSnapshot.length; i++) {
            const frame = stackSnapshot[i];
            
            const stackFrame = document.createElement('div');
            stackFrame.className = 'stack-frame';
            stackFrame.style.zIndex = 100 - i; // Garantir que os frames superiores fiquem à frente
            
            // Marca o frame como uma função completada se já retornou anteriormente
            if (this.completedFunctions.has(frame.function)) {
                stackFrame.classList.add('frame-completed');
            }
            
            // Cabeçalho do frame
            const frameHeader = document.createElement('div');
            frameHeader.className = 'stack-header';
            
            // Se a função já retornou antes, destaca isso visualmente
            if (this.completedFunctions.has(frame.function)) {
                frameHeader.classList.add('header-completed');
            }
            
            frameHeader.textContent = `${frame.function}()`;
            stackFrame.appendChild(frameHeader);
            
            // Corpo do frame - contém as variáveis
            const frameBody = document.createElement('div');
            frameBody.className = 'stack-body';
            
            // Variáveis do frame
            const varsContainer = document.createElement('div');
            varsContainer.className = 'stack-variables';
            
            // Adiciona parâmetros e variáveis
            for (const [name, details] of Object.entries(frame.variables)) {
                const varElem = document.createElement('div');
                varElem.className = 'stack-variable';
                
                const varNameElem = document.createElement('span');
                varNameElem.className = 'stack-var-name';
                varNameElem.textContent = name;
                
                const varValueElem = document.createElement('span');
                varValueElem.className = 'stack-var-value';
                varValueElem.textContent = ` = ${details.value}`;
                
                const varAddressElem = document.createElement('span');
                varAddressElem.className = 'stack-var-address';
                varAddressElem.textContent = ` (${details.address})`;
                
                varElem.appendChild(varNameElem);
                varElem.appendChild(varValueElem);
                varElem.appendChild(varAddressElem);
                varsContainer.appendChild(varElem);
            }
            
            frameBody.appendChild(varsContainer);
            
            // Valor de retorno, se houver
            if (frame.returnValue !== null) {
                const returnElem = document.createElement('div');
                returnElem.className = 'stack-return';
                returnElem.textContent = `Retorno: ${frame.returnValue}`;
                frameBody.appendChild(returnElem);
            }
            
            stackFrame.appendChild(frameBody);
            
            // Adiciona o frame à visualização da pilha
            stackVisual.appendChild(stackFrame);
        }
        
        this.stackContainer.appendChild(stackVisual);
    }

    /**
     * Atualiza a visualização da saída
     * @param {Array} outputLines - Linhas de saída
     */
    updateOutputView(outputLines) {
        if (!this.outputContainer) return;
        
        this.outputContainer.innerHTML = '';
        
        if (outputLines.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'output-empty';
            emptyMsg.textContent = 'Sem saída';
            this.outputContainer.appendChild(emptyMsg);
            return;
        }
        
        const outputText = document.createElement('pre');
        outputText.className = 'output-text';
        outputText.textContent = outputLines.join('\n');
        
        this.outputContainer.appendChild(outputText);
    }

    /**
     * Destaca uma linha específica do código
     * @param {Object} statement - Declaração atual sendo executada
     * @param {string} functionName - Nome da função atual
     */
    highlightCodeLine(statement, functionName) {
        // Remove destaque anterior
        if (this.currentLine !== null) {
            this.unhighlightCurrentLine();
        }
        
        // Determina a linha a ser destacada
        let lineNumber = -1;
        
        if (!statement) return;
        
        switch (statement.type) {
            case 'variable_declaration':
                lineNumber = this.lineMap.get(`variable:${statement.name}`);
                break;
            case 'assignment':
                lineNumber = this.lineMap.get(`assignment:${statement.name}`);
                break;
            case 'function_call':
                lineNumber = this.lineMap.get(`call:${statement.name}`);
                break;
            case 'return':
                // Procura por qualquer return na função atual
                for (const [key, line] of this.lineMap.entries()) {
                    if (key.startsWith('return:') && key.includes(functionName)) {
                        lineNumber = line;
                        break;
                    }
                }
                break;
            case 'if_condition':
            case 'else_start':
                // Procura por condicionais
                for (const [key, line] of this.lineMap.entries()) {
                    if (key.startsWith('conditional:')) {
                        lineNumber = line;
                        break;
                    }
                }
                break;
        }
        
        if (lineNumber >= 0) {
            this.highlightLineInTextarea(lineNumber);
            
            // Atualiza o indicador de linha
            this.updateLineIndicator(lineNumber, statement, functionName);
        }
    }
    
    /**
     * Atualiza o indicador de linha com a informação atual
     * @param {number} lineNumber - Número da linha (base 0)
     * @param {Object} statement - Declaração atual sendo executada
     * @param {string} functionName - Nome da função atual
     */
    updateLineIndicator(lineNumber, statement, functionName) {
        // Linha base 1 para exibição ao usuário
        const displayLineNumber = lineNumber + 1;
        
        // Atualiza o número da linha
        if (this.lineNumberElement) {
            this.lineNumberElement.textContent = displayLineNumber;
        }
        
        // Obtém o contexto da linha (o texto da linha)
        const text = this.codeTextArea.value;
        const lines = text.split('\n');
        const lineContent = lineNumber < lines.length ? lines[lineNumber].trim() : '';
        
        // Atualiza o contexto da linha
        if (this.lineContextElement) {
            let context = `${lineContent}`;
            
            // Adiciona contexto adicional baseado no tipo de instrução
            if (statement.type === 'function_call') {
                context += ` [Chamada de função: ${statement.name}()]`;
            } else if (statement.type === 'return') {
                context += ` [Retorno de ${functionName}()]`;
            } else if (statement.type === 'variable_declaration') {
                context += ` [Declaração de variável: ${statement.name}]`;
            } else if (statement.type === 'assignment') {
                context += ` [Atribuição: ${statement.name}]`;
            }
            
            this.lineContextElement.textContent = context;
        }
        
        // Atualiza a classe para indicar execução ativa
        if (this.lineIndicator) {
            this.lineIndicator.classList.add('executing');
        }
    }
    
    /**
     * Remove o destaque da linha atual
     */
    unhighlightCurrentLine() {
        const textarea = this.codeTextArea;
        if (!textarea) return;
        
        textarea.setSelectionRange(0, 0);
        this.currentLine = null;
        
        // Reseta o indicador de linha
        if (this.lineNumberElement) {
            this.lineNumberElement.textContent = '-';
        }
        
        if (this.lineContextElement) {
            this.lineContextElement.textContent = 'Nenhuma execução em andamento';
        }
        
        if (this.lineIndicator) {
            this.lineIndicator.classList.remove('executing');
        }
    }
    
    /**
     * Destaca uma linha no textarea
     * @param {number} lineNumber - Número da linha a destacar (0-indexed)
     */
    highlightLineInTextarea(lineNumber) {
        const textarea = this.codeTextArea;
        if (!textarea) return;
        
        const text = textarea.value;
        const lines = text.split('\n');
        
        // Encontra a posição do início da linha
        let pos = 0;
        for (let i = 0; i < lineNumber; i++) {
            pos += lines[i].length + 1; // +1 para o caractere de nova linha
        }
        
        // Define o range de seleção para a linha
        const lineStart = pos;
        const lineEnd = pos + lines[lineNumber].length;
        
        // Foca o textarea e define a seleção
        textarea.focus();
        textarea.setSelectionRange(lineStart, lineEnd);
        
        // Salva a linha atual
        this.currentLine = lineNumber;
        
        // Rola para mostrar a linha destacada
        this.scrollToLine(textarea, lineNumber, lines.length);
    }
    
    /**
     * Rola o textarea para mostrar a linha destacada
     * @param {HTMLTextAreaElement} textarea - O elemento textarea
     * @param {number} lineNumber - Número da linha a mostrar
     * @param {number} totalLines - Total de linhas no texto
     */
    scrollToLine(textarea, lineNumber, totalLines) {
        const lineHeight = textarea.scrollHeight / totalLines;
        const scrollTarget = lineHeight * lineNumber;
        
        // Calcula uma posição que coloca a linha no centro visível
        const visibleHeight = textarea.clientHeight;
        const centerScroll = scrollTarget - (visibleHeight / 2) + (lineHeight / 2);
        
        textarea.scrollTop = Math.max(0, centerScroll);
    }

    /**
     * Desenha conexões entre ponteiros e seus alvos
     */
    drawPointerConnections() {
        // Remove antigas conexões
        const oldConnections = document.querySelectorAll('.pointer-connection');
        oldConnections.forEach(conn => conn.remove());
        
        // Para cada conexão de ponteiro
        for (const [sourceAddress, targetAddress] of this.pointerConnections.entries()) {
            // Encontra os elementos DOM
            const sourceElem = document.querySelector(`.memory-cell[data-address="${sourceAddress}"]`);
            const targetElem = document.querySelector(`.memory-cell[data-address="${targetAddress}"]`);
            
            if (!sourceElem || !targetElem) continue;
            
            // Esta é uma implementação simples - na prática, 
            // você pode querer usar SVG para desenhar setas curvas
            // entre os elementos de forma mais elegante
            
            // Adiciona uma classe visual ao alvo para indicar que é alvo de um ponteiro
            targetElem.classList.add('pointer-target');
        }
    }

    /**
     * Atualiza toda a visualização
     * @param {Object} state - Estado atual da execução
     * @param {Array} completedFrames - Frames de função que foram finalizados
     */
    updateVisualizations(state, completedFrames = []) {
        this.updateMemoryView(state.memory, state.stack);
        this.updateStackView(state.stack, completedFrames);
        this.updateOutputView(state.output);
        
        // Destaca a linha atual no código
        if (state.statement) {
            this.highlightCodeLine(state.statement, state.function);
        }
    }

    /**
     * Limpa todas as visualizações
     */
    clearAll() {
        if (this.memoryContainer) this.memoryContainer.innerHTML = '';
        if (this.stackContainer) this.stackContainer.innerHTML = '';
        if (this.outputContainer) this.outputContainer.innerHTML = '';
        this.pointerConnections.clear();
        this.unhighlightCurrentLine();
        this.completedFunctions.clear();
    }
}

// Exporta a classe
window.CVisualizer = CVisualizer;