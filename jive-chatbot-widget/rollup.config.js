import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: [
    {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
      entryFileNames: 'jive-chatbot.js'
    },
    {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
      entryFileNames: 'jive-chatbot.min.js',
      plugins: [terser()]
    },
    {
      dir: 'dist',
      format: 'umd',
      name: 'JiveChatbot',
      sourcemap: true,
      entryFileNames: 'jive-chatbot.umd.js'
    },
    {
      dir: 'dist',
      format: 'umd',
      name: 'JiveChatbot',
      sourcemap: true,
      entryFileNames: 'jive-chatbot.umd.min.js',
      plugins: [terser()]
    }
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      clean: true
    })
  ],
  // Bundle all dynamic imports
  inlineDynamicImports: true
}; 