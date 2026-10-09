#include <gtest/gtest.h>

#include "domain/Pid.hpp"

namespace micromouse::domain {

namespace {

TEST(Pid, ProporcionalPuro) {
    Pid pid({2.0, 0.0, 0.0});
    EXPECT_DOUBLE_EQ(pid.update(3.0, 0.1), 6.0);
}

}  // namespace

}  // namespace micromouse::domain
