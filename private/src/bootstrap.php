<?php
declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/db.php';
require __DIR__ . '/http.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/data.php';
require __DIR__ . '/files.php';
require __DIR__ . '/fetch.php';
require __DIR__ . '/gadgets.php';
require __DIR__ . '/shares.php';

mb_internal_encoding('UTF-8');
date_default_timezone_set('UTC');
ini_set('display_errors', '0');
