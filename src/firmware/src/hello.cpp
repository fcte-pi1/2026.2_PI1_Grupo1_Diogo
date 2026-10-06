#include "hello.hpp"

#include <iostream>

namespace firmware {

std::string hello_message() {
    return "Hello World";
}

void say_hello() {
    std::cout << hello_message() << '\n';
}

}  // namespace firmware
