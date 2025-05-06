/**
 * Arquivo principal que coordena o simulador C99
 * Conecta a interface do usuário com as classes de execução e visualização
 */

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa os componentes principais
    const executor = new CExecutor();
    const visualizer = new CVisualizer();
    
    // Elementos da interface
    const codeTextArea = document.getElementById('c-code');
    const runButton = document.getElementById('run-button');
    const stepButton = document.getElementById('step-button');
    const resetButton = document.getElementById('reset-button');
    
    // Estado da execução
    let isRunning = false;
    let executionInterval = null;
    
    // Inicializa o simulador com o código inicial
    function initializeSimulator() {
        const code = codeTextArea.value;
        executor.initialize(code);
        
        // Inicializa o mapeamento de linhas para o código atual
        visualizer.initializeLineMapping(executor.ast, code);
        
        visualizer.clearAll();
        updateUIState();
    }
    
    // Atualiza o estado da interface com base no estado da execução
    function updateUIState() {
        const state = executor.getExecutionState();
        
        // Atualiza visualizações, agora passando os frames completados
        visualizer.updateVisualizations(state, state.completedFrames);
        
        // Atualiza botões
        runButton.textContent = state.isRunning && !state.isPaused ? 'Pausar' : 'Executar';
        runButton.disabled = !state.isRunning && state.done;
        stepButton.disabled = !state.isRunning || state.done;
        
        // Atualiza indicador de linha atual
        if (state.statement) {
            visualizer.highlightCodeLine(state.statement, state.function);
        }
    }
    
    // Executa o código completo
    function runCode() {
        if (!executor.isRunning) {
            initializeSimulator();
            
            // Executa até o fim ou até ser pausado
            executor.resume();
            executionInterval = setInterval(() => {
                const result = executor.step();
                updateUIState();
                
                if (result.done) {
                    clearInterval(executionInterval);
                }
            }, 300); // Velocidade da execução
        } else if (executor.isPaused) {
            // Continua a execução
            executor.resume();
            executionInterval = setInterval(() => {
                const result = executor.step();
                updateUIState();
                
                if (result.done) {
                    clearInterval(executionInterval);
                }
            }, 300); // Velocidade da execução
        } else {
            // Pausa a execução
            executor.pause();
            clearInterval(executionInterval);
            updateUIState();
        }
    }
    
    // Executa um passo do código
    function stepCode() {
        if (!executor.isRunning) {
            initializeSimulator();
        }
        
        const result = executor.step();
        updateUIState();
    }
    
    // Reinicia o simulador
    function resetSimulator() {
        if (executionInterval) {
            clearInterval(executionInterval);
        }
        
        executor.reset();
        visualizer.clearAll();
        updateUIState();
    }
    
    // Eventos dos botões
    runButton.addEventListener('click', runCode);
    stepButton.addEventListener('click', stepCode);
    resetButton.addEventListener('click', resetSimulator);
    
    // Impede a perda de foco quando clica em execute e step
    runButton.addEventListener('mousedown', (e) => e.preventDefault());
    stepButton.addEventListener('mousedown', (e) => e.preventDefault());
    
    // Inicialização
    initializeSimulator();
    
    // Ajuda a visualizar a estrutura de ponteiros na memória
    window.addEventListener('resize', () => {
        visualizer.drawPointerConnections();
    });
    
    // Atualiza o mapeamento de linhas quando o código é alterado
    codeTextArea.addEventListener('blur', () => {
        // Somente atualiza se o simulador não estiver em execução
        if (!executor.isRunning) {
            initializeSimulator();
        }
    });
    
    // Exporta para uso no console (debug)
    window.simulator = {
        executor,
        visualizer,
        run: runCode,
        step: stepCode,
        reset: resetSimulator
    };
});