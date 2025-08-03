const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      background: './src/background.ts'
      // TODO: Add other entry points when files are created:
      // content: './src/content.ts',
      // popup: './src/popup.ts',
      // 'spocket-content': './src/spocket-content.ts',
      // injected: './src/injected.ts'
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@/types': path.resolve(__dirname, 'src/types'),
        '@/agents': path.resolve(__dirname, 'src/agents'),
        '@/utils': path.resolve(__dirname, 'src/utils')
      }
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'dist'),
      clean: true
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'popup.html', to: 'popup.html' },
          { from: 'icons', to: 'icons', noErrorOnMissing: true }
        ]
      })
    ],
    devtool: isProduction ? false : 'inline-source-map',
    optimization: {
      minimize: isProduction
    },
    target: 'web'
  };
};
