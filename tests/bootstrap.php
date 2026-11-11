<?php

declare(strict_types=1);

// standalone checkout first, then the dev shell this package may be embedded in
foreach ([__DIR__ . '/../vendor/autoload.php', __DIR__ . '/../../../vendor/autoload.php'] as $autoload) {
    if (is_file($autoload)) {
        require $autoload;
        return;
    }
}
fwrite(STDERR, "No autoloader found, run composer install.\n");
exit(1);
