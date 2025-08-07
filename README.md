# C99Simulator

## Features

### Implemented
- **Arrays**: Basic single-dimensional arrays are supported.
  - Declaration with fixed size (`int arr[10];`).
  - Initialization with a list (`int arr[] = {1, 2, 3};`).
  - Initialization with a string literal (`char s[] = "hello";`).
- **Recursion**: Simple recursion with a single recursive call is supported (e.g., factorial).
- **Loops and Ifs**: Basic control flow is supported.
  - `if-else` statements.
  - `while` loops.
  - `for` loops.

### Known Issues and Limitations
- **Parser**: The regex-based parser is not very robust and requires a specific code style.
- **Expressions**: The expression evaluator is limited and does not support complex expressions with multiple operators or operator precedence.
- **Recursion**: The simulator does not correctly handle recursion with multiple recursive calls in the same expression (e.g., Fibonacci).