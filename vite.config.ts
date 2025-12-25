import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Setting base to './' is crucial for GitHub Pages deployment
  // It ensures assets are loaded relative to the index.html location
  base: './', 
})
