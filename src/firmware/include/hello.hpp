#pragma once

#include <string>

namespace firmware {

/// Returns the greeting message.
[[nodiscard]] std::string hello_message();

/// Prints the greeting message to standard output.
void say_hello();

}  // namespace firmware
