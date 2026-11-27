// Tandem landing: the kit's two boot lines, moved out of inline <script> so the page keeps a strict CSP.
document.documentElement.classList.add('m-enter');
setTimeout(() => document.documentElement.classList.add('m-enter-done'), 700);
document.documentElement.classList.add('mo-js');
setTimeout(() => document.documentElement.classList.add('mo-safe'), 2500);
