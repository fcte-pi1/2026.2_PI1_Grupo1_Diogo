#include <gtest/gtest.h>

#include "hello.hpp"

namespace {

TEST(HelloMessage, ReturnsHelloWorld) { EXPECT_EQ(firmware::hello_message(), "Hello World"); }

TEST(HelloMessage, DoesNotReturnEmpty) { EXPECT_FALSE(firmware::hello_message().empty()); }

TEST(SayHello, PrintsMessageWithNewline) {
    testing::internal::CaptureStdout();
    firmware::say_hello();
    const std::string output = testing::internal::GetCapturedStdout();

    EXPECT_EQ(output, "Hello World\n");
}

}  // namespace
