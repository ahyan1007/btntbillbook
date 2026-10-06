import type { Config } from 'tailwindcss';
const config: Config = { content: ['./app/**/*.{ts,tsx}'], theme: { extend: { colors: { brand: { blue:'#1487c9', orange:'#f7941d', ink:'#0f172a', soft:'#f5f9fc' } }, boxShadow:{card:'0 12px 35px rgba(15,23,42,.07)'} } }, plugins:[] };
export default config;