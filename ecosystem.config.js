module.exports = {
  apps: [{
    name: 'milena-bot',
    script: 'src/index.js',
    watch: false,
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    error_file: 'logs/pm2/error.log',
    out_file: 'logs/pm2/out.log',
    merge_logs: true,
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_restarts: 10,
    restart_delay: 4000,
    wait_ready: true,
    kill_timeout: 5000,
    exec_mode: 'fork',
    exp_backoff_restart_delay: 100,
    node_args: '--max-old-space-size=1536',
    increment_var: 'PORT',
    ignore_watch: [
      'node_modules',
      'logs',
      '.git',
      '*.log',
      '*.json'
    ],
    env_variables: {
      PORT: 3000
    }
  }]
};
