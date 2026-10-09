<?php
declare(strict_types=1);

// Usage:  php private/bin/hash-passphrase.php
// Prints the line to paste into private/.env. The passphrase itself is never stored.
if (PHP_SAPI !== 'cli') {
    exit("Run this from a terminal.\n");
}
fwrite(STDOUT, "Choose a long passphrase (it is not shown): ");
if (DIRECTORY_SEPARATOR === '/') {
    system('stty -echo');
}
$p1 = rtrim((string) fgets(STDIN), "\r\n");
if (DIRECTORY_SEPARATOR === '/') {
    system('stty echo');
}
fwrite(STDOUT, "\nRepeat it: ");
if (DIRECTORY_SEPARATOR === '/') {
    system('stty -echo');
}
$p2 = rtrim((string) fgets(STDIN), "\r\n");
if (DIRECTORY_SEPARATOR === '/') {
    system('stty echo');
}
fwrite(STDOUT, "\n");
if ($p1 === '' || $p1 !== $p2) {
    exit("Empty or not matching. Nothing printed.\n");
}
if (strlen($p1) < 10) {
    fwrite(STDOUT, "Warning: that is short. 14+ characters or a few random words is much safer.\n");
}
fwrite(STDOUT, "\nPaste this line into private/.env:\n\nHB_PASSPHRASE_HASH='" . password_hash($p1, PASSWORD_DEFAULT) . "'\n");
