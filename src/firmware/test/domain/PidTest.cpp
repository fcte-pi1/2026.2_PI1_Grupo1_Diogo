#include <gtest/gtest.h>

#include "domain/Pid.hpp"

namespace micromouse::domain {

namespace {

TEST(Pid, ProporcionalPuro) {
    Pid pid({2.0, 0.0, 0.0});
    EXPECT_DOUBLE_EQ(pid.update(3.0, 0.1), 6.0);
}

TEST(Pid, IntegralAcumula) {
    Pid pid({0.0, 5.0, 0.0});
    EXPECT_DOUBLE_EQ(pid.update(2.0, 0.1), 1.0);
    EXPECT_DOUBLE_EQ(pid.update(2.0, 0.1), 2.0);
}

TEST(Pid, DerivativoReageAVariacao) {
    Pid pid({0.0, 0.0, 4.0});
    EXPECT_DOUBLE_EQ(pid.update(1.0, 0.1), 0.0);
    EXPECT_DOUBLE_EQ(pid.update(3.0, 0.1), 80.0);
}

TEST(PidTest, ResetZeraEstado) {
    Pid pid({1.0, 1.0, 1.0});
    pid.update(10.0, 0.1);
    pid.update(10.0, 0.1);
    pid.reset();
    EXPECT_DOUBLE_EQ(pid.update(5.0, 0.1), 5.5);
}

}  // namespace

}  // namespace micromouse::domain
