#ifndef RANDOMBYTES_OPENSSL_H
#define RANDOMBYTES_OPENSSL_H

#include <openssl/rand.h>

#ifdef __cplusplus
extern "C" {
#endif

int randombytes(uint8_t *x, size_t xlen);

#ifdef __cplusplus
}
#endif

#endif
