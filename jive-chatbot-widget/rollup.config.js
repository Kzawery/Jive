import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import nodePolyfills from 'rollup-plugin-polyfill-node';

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
      entryFileNames: 'jive-chatbot.umd.js',
      globals: {
        'socket.io-client': 'io'
      }
    },
    {
      dir: 'dist',
      format: 'umd',
      name: 'JiveChatbot',
      sourcemap: true,
      entryFileNames: 'jive-chatbot.umd.min.js',
      globals: {
        'socket.io-client': 'io'
      },
      plugins: [terser()]
    }
  ],
  plugins: [
    nodePolyfills(),
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      clean: true
    })
  ],
  // Bundle all dynamic imports
  inlineDynamicImports: true,
  // Mark socket.io-client as external
  external: ['socket.io-client']
}; 