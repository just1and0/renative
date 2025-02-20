import axios from 'axios';
import ora from 'ora';

import Config from '../config';

export const isBundlerRunning = async () => {
    try {
        const { data } = await axios.get(`http://127.0.0.1:${Config.currentPlatformDefaultPort}`);
        if (data.includes('React Native')) return true;
        return false;
    } catch {
        return false;
    }
};

export const waitForBundler = async () => {
    let attempts = 0;
    const maxAttempts = 10;
    const CHECK_INTEVAL = 1000;
    const spinner = ora('Waiting for emulator to boot...').start();

    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            isBundlerRunning()
                .then((running) => {
                    if (running) {
                        clearInterval(interval);
                        spinner.succeed();
                        return resolve(true);
                    }
                    attempts++;
                    if (attempts === maxAttempts) {
                        clearInterval(interval);
                        spinner.fail('Can\'t connect to bundler. Try restarting it.');
                        return reject('Can\'t connect to bundler. Try restarting it.');
                    }
                }).catch(() => {
                    attempts++;
                    if (attempts > maxAttempts) {
                        clearInterval(interval);
                        spinner.fail('Can\'t connect to bundler. Try restarting it.');
                        return reject('Can\'t connect to bundler. Try restarting it.');
                    }
                });
        }, CHECK_INTEVAL);
    });
};
