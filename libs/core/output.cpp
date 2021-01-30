#include "pxt.h"
#include "ev3const.h"

#include <sys/stat.h>
#include <sys/types.h>

namespace output {

/**
 * Create a new zero-initialized buffer.
 * @param size number of bytes in the buffer
 */
//%
Buffer createBuffer(int size) {
    return mkBuffer(NULL, size);
}

}

namespace pxt {

void target_init() {
    mkdir(SETTINGSDIR, 0777);
}

}

namespace motors {

/**
 *  Mark a motor as used
 */
//%
void __motorUsed(int port, bool large) {
}
}