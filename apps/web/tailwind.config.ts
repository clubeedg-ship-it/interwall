import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './src/**/*.{ts,tsx}',
        '../../packages/ui/src/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                serif: ['Georgia', 'Times New Roman', 'serif'],
            },
        },
    },
    plugins: [],
};

export default config;
