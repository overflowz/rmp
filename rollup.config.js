import pkg from './package.json';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';

export default {
  input: `${__dirname}/src/index.ts`,
  output: {
    dir: `${__dirname}/dist`,
    format: 'cjs',
    strict: true,
    sourcemap: true,
  },
  plugins: [typescript(), terser()],
  external: [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    'rxjs/operators',
  ],
};
